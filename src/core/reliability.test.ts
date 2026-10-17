import { expect, test } from "bun:test";
import { ExecutionEngine } from "./execution-engine.js";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { createDatabase } from "../db/database.js";
import {
  createAutomation,
  activateAutomation,
  updateAutomation,
} from "../api/automations.js";
import { runAutomation } from "../api/runs.js";
import { rerunFromNode } from "../api/rerun.js";
import { createExpressionEvaluator, resolveParams } from "./expressions.js";
import { createRequestGuard } from "../api/security.js";
import type { AutomationNode, AutomationDefinition } from "./types.js";
import "../nodes/index.js";
const node = (id: string, type: string, params = {}): AutomationNode => ({
  id,
  type,
  typeVersion: 1,
  name: id,
  params,
  target: { kind: "local" },
  disabled: false,
  position: { x: 0, y: 0 },
});
const edge = (
  source: string,
  target: string,
  sourcePort = "out",
  targetPort = "in",
) => ({
  id: `${source}-${sourcePort}-${target}-${targetPort}`,
  source,
  target,
  sourcePort,
  targetPort,
});
const graph = (
  nodes: AutomationNode[],
  edges: AutomationDefinition["edges"],
): AutomationDefinition => ({
  schemaVersion: 1,
  name: "Regression",
  nodes,
  edges,
  settings: { runTimeoutSec: 10, savePayloads: true, errorAutomationId: null },
});
test("only selected IF branches execute actions; merge sees active inputs", async () => {
  const dispatcher = new AgentDispatcher();
  const def = graph(
    [
      node("start", "trigger.manual"),
      node("if", "logic.if", { condition: "false" }),
      node("yes", "state.set", { key: "wrong", valueExpression: "true" }),
      node("no", "state.set", { key: "right", valueExpression: "true" }),
      node("merge", "logic.merge"),
    ],
    [
      edge("start", "if"),
      edge("if", "yes", "true"),
      edge("if", "no", "false"),
      edge("yes", "merge", "out", "in1"),
      edge("no", "merge", "out", "in2"),
    ],
  );
  const run = await new ExecutionEngine(dispatcher).execute(def, "a", "v", {
    mode: "manual",
  });
  expect(run.status).toBe("success");
  expect(dispatcher.getState("a", "wrong")).toBeUndefined();
  expect(dispatcher.getState("a", "right")).toBe(true);
  expect(
    run.nodeExecutions.find((n) => n.nodeId === "merge")?.input,
  ).toHaveLength(1);
});
test("cycles fail instead of succeeding without work", async () => {
  const def = graph(
    [
      node("a", "logic.delay", { seconds: 0 }),
      node("b", "logic.delay", { seconds: 0 }),
    ],
    [edge("a", "b"), edge("b", "a")],
  );
  const run = await new ExecutionEngine(new AgentDispatcher()).execute(
    def,
    "a",
    "v",
    { mode: "manual" },
  );
  expect(run.status).toBe("error");
  expect(run.error).toContain("Cycles");
});
test("webhook input reaches the selected trigger; other triggers do not execute", async () => {
  const def = graph(
    [
      node("hook", "trigger.webhook", { path: "event" }),
      node("manual", "trigger.manual"),
    ],
    [],
  );
  const run = await new ExecutionEngine(new AgentDispatcher()).execute(
    def,
    "a",
    "v",
    {
      mode: "trigger",
      triggerNodeId: "hook",
      triggerData: [{ json: { body: { event: 42 } } }],
    },
  );
  expect(run.nodeExecutions).toHaveLength(1);
  expect(run.nodeExecutions[0].output?.[0].json.body).toEqual({ event: 42 });
});
test("typed expression values and arrays survive; host access and runaway code are blocked", () => {
  const context = {
    json: {},
    items: [],
    node: { id: "a", name: "a" },
    env: {},
    state: {},
    now: new Date(),
  };
  expect(
    resolveParams({ a: "{{ false }}", b: [1, "{{ ({x: 2}) }}"] }, context),
  ).toEqual({ a: false, b: [1, { x: 2 }] });
  const evaluator = createExpressionEvaluator();
  expect(evaluator.evaluate("typeof process", context)).toBe("undefined");
  expect(() => evaluator.evaluate("(()=>{while(true){}})()", context)).toThrow(
    "interrupted",
  );
  expect(() =>
    evaluator.evaluate(
      "$json.constructor.constructor('return process')()",
      context,
    ),
  ).toThrow();
});
test("last node honors run deadline; cancellation is terminal", async () => {
  const def = graph(
    [
      node("start", "trigger.manual"),
      node("wait", "logic.delay", { seconds: 1 }),
    ],
    [edge("start", "wait")],
  );
  def.settings.runTimeoutSec = 0.02;
  const dispatcher = new AgentDispatcher(),
    engine = new ExecutionEngine(dispatcher);
  const run = await engine.execute(def, "a", "v", { mode: "manual" });
  expect(run.status).toBe("error");
  expect(run.error).toContain("timed out");
  def.settings.runTimeoutSec = 10;
  const work = engine.execute(def, "a", "v", {
    mode: "manual",
    runId: "cancel-test",
  });
  await Bun.sleep(10);
  expect(dispatcher.cancelRun("cancel-test")).toBe(true);
  expect((await work).status).toBe("cancelled");
});
test("loop runs each batch then only the done path", async () => {
  const def = graph(
    [
      node("start", "trigger.manual", {
        testData: [{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 3 } }],
      }),
      node("loop", "logic.loop", { batchSize: 2 }),
      node("body", "logic.code", {
        code: "return ctx.items.map(x => ({json:{n:x.json.n*2}}));",
      }),
      node("done", "logic.merge"),
    ],
    [
      edge("start", "loop"),
      edge("loop", "body"),
      edge("body", "loop", "out", "continue"),
      edge("loop", "done", "done", "in1"),
    ],
  );
  const run = await new ExecutionEngine(new AgentDispatcher()).execute(
    def,
    "a",
    "v",
    { mode: "manual" },
  );
  expect(run.status).toBe("success");
  expect(run.nodeExecutions.filter((n) => n.nodeId === "body")).toHaveLength(2);
  expect(
    run.nodeExecutions
      .find((n) => n.nodeId === "done")
      ?.output?.map((i) => i.json.n),
  ).toEqual([2, 4, 6]);
});
test("state and immutable run history survive dispatcher replacement; manual uses draft; rerun executes target", async () => {
  const db = createDatabase(":memory:");
  try {
    const def = graph(
      [
        node("start", "trigger.manual"),
        node("set", "state.set", { key: "value", valueExpression: "1" }),
      ],
      [edge("start", "set")],
    );
    const auto = createAutomation(db.db, def.name, def);
    activateAutomation(db.db, auto.id);
    def.nodes[1].params.valueExpression = "2";
    updateAutomation(db.db, auto.id, def);
    const first = new AgentDispatcher();
    first.attachDatabase(db.db);
    const run = await runAutomation(db.db, first, auto.id, { mode: "manual" });
    expect(run?.status).toBe("success");
    expect(first.getState(auto.id, "value")).toBe(2);
    const second = new AgentDispatcher();
    second.attachDatabase(db.db);
    expect(second.getRun(run!.id)?.status).toBe("success");
    expect(second.getState(auto.id, "value")).toBe(2);
    second.setState(auto.id, "value", 0);
    const rerun = await rerunFromNode(db.db, second, run!.id, "set");
    expect(rerun?.nodeExecutions[0].pinned).toBe(false);
    expect(second.getState(auto.id, "value")).toBe(2);
    await runAutomation(db.db, second, auto.id, { mode: "trigger" });
    expect(second.getState(auto.id, "value")).toBe(1);
  } finally {
    db.close();
  }
});
test("local request guard rejects hostile browser origins and DNS rebinding", () => {
  const guard = createRequestGuard({
    mode: "standalone",
    port: 7480,
    host: "127.0.0.1",
    dataDir: "/tmp",
    dbPath: "/tmp/test.db",
    noBrowser: true,
    publicUrl: null,
  });
  expect(
    guard(
      new Request("http://127.0.0.1:7480/api/credentials", {
        headers: { Origin: "https://evil.example" },
      }),
    )?.status,
  ).toBe(403);
  expect(
    guard(new Request("http://evil.example:7480/api/credentials"))?.status,
  ).toBe(403);
  expect(
    guard(new Request("http://127.0.0.1:7480/api/credentials")),
  ).toBeNull();
});

test("set fields evaluates each item without losing JSON types; dry state stays in its run", async () => {
  const dispatcher = new AgentDispatcher();
  const def = graph(
    [
      node("start", "trigger.manual", {
        testData: [{ json: { n: 2 } }, { json: { n: 5 } }],
      }),
      node("fields", "logic.set", {
        assignments: [{ field: "doubled", value: "{{ $json.n * 2 }}" }],
      }),
      node("write", "state.set", { key: "answer", valueExpression: "42" }),
      node("read", "state.get", { key: "answer" }),
    ],
    [edge("start", "fields"), edge("fields", "write"), edge("write", "read")],
  );
  const run = await new ExecutionEngine(dispatcher).execute(def, "a", "v", {
    mode: "dry",
  });
  expect(run.status).toBe("success");
  expect(
    run.nodeExecutions
      .find((n) => n.nodeId === "fields")
      ?.output?.map((i) => i.json.doubled),
  ).toEqual([4, 10]);
  expect(run.nodeExecutions.at(-1)?.output?.[0].json.state_answer).toBe(42);
  expect(dispatcher.getState("a", "answer")).toBeUndefined();
});
test("cancellation kills a command's process group before a delayed side effect", async () => {
  const { mkdtempSync, existsSync, rmSync } = await import("node:fs");
  const dir = mkdtempSync("/tmp/ap-cancellation-");
  try {
    const dispatcher = new AgentDispatcher();
    const def = graph(
      [
        node("start", "trigger.manual"),
        node("command", "system.command", {
          command: `sleep 0.3; touch '${dir}/unexpected'`,
        }),
      ],
      [edge("start", "command")],
    );
    const work = new ExecutionEngine(dispatcher).execute(def, "a", "v", {
      mode: "manual",
      runId: "kill-child",
    });
    await Bun.sleep(40);
    expect(dispatcher.cancelRun("kill-child")).toBe(true);
    expect((await work).status).toBe("cancelled");
    await Bun.sleep(400);
    expect(existsSync(`${dir}/unexpected`)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("resolved secrets are redacted in saved records while live downstream data works", async () => {
  const { CredentialVault } = await import("./credential-vault.js");
  const { EnvResolver } = await import("./env-resolver.js");
  const db = createDatabase(":memory:");
  try {
    const vault = new CredentialVault(db),
      env = new EnvResolver(db, vault);
    env.setVar("global", null, "PRIVATE_VALUE", "secret-unique-123", true);
    const dispatcher = new AgentDispatcher(vault, env);
    dispatcher.attachDatabase(db.db);
    const def = graph(
      [
        node("start", "trigger.manual"),
        node("echo", "system.command", {
          command: "printf '%s' \"$PRIVATE_VALUE\"",
        }),
        node("check", "logic.code", {
          code: "return [{json:{matched:ctx.items[0].json.stdout===ctx.$env.PRIVATE_VALUE}}];",
        }),
      ],
      [edge("start", "echo"), edge("echo", "check")],
    );
    const auto = createAutomation(db.db, def.name, def);
    const run = await runAutomation(db.db, dispatcher, auto.id, {
      mode: "manual",
    });
    expect(run?.status).toBe("success");
    expect(run?.nodeExecutions.at(-1)?.output?.[0].json.matched).toBe(true);
    expect(JSON.stringify(dispatcher.getRun(run!.id))).not.toContain(
      "secret-unique-123",
    );
    expect(
      JSON.stringify(
        db.db.query("SELECT record_json FROM node_executions").all(),
      ),
    ).not.toContain("secret-unique-123");
    expect(
      JSON.stringify(db.db.query("SELECT value FROM env_vars").all()),
    ).not.toContain("secret-unique-123");
  } finally {
    db.close();
  }
});

test("invalid code output does not commit sandbox state writes", async () => {
  const dispatcher = new AgentDispatcher();
  const def = graph(
    [
      node("start", "trigger.manual"),
      node("code", "logic.code", {
        code: "ctx.$state.set('unexpected', true); return 'invalid';",
      }),
    ],
    [edge("start", "code")],
  );
  const run = await new ExecutionEngine(dispatcher).execute(def, "a", "v", {
    mode: "manual",
  });
  expect(run.status).toBe("error");
  expect(dispatcher.getState("a", "unexpected")).toBeUndefined();
});

test("large recorded payloads hydrate for replay and fail clearly after expiry", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { ArtifactStore } = await import("../api/artifacts.js");
  const dir = mkdtempSync("/tmp/ap-payloads-");
  const db = createDatabase(`${dir}/ap.db`);
  try {
    const artifacts = new ArtifactStore(dir, db.db),
      dispatcher = new AgentDispatcher(undefined, undefined, artifacts);
    dispatcher.attachDatabase(db.db);
    const def = graph(
      [
        node("start", "trigger.manual"),
        node("large", "logic.code", {
          code: "return [{json:{text:'x'.repeat(1100000)}}]",
        }),
      ],
      [edge("start", "large")],
    );
    const auto = createAutomation(db.db, def.name, def);
    const run = await runAutomation(db.db, dispatcher, auto.id, {
      mode: "manual",
    });
    expect(run?.status).toBe("success");
    const saved = dispatcher.getRun(run!.id)!.nodeExecutions.at(-1)!;
    expect(saved.output).toBeNull();
    expect(saved.payloadArtifact?.mime).toBe("application/json");
    expect(
      dispatcher.getRun(run!.id, true)!.nodeExecutions.at(-1)!.output![0].json
        .text,
    ).toHaveLength(1100000);
    db.db
      .prepare("UPDATE artifacts SET expires_at='2000-01-01T00:00:00.000Z'")
      .run();
    expect(() => dispatcher.getRun(run!.id, true)).toThrow("expired");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interrupted attempts survive platform restart without replay", () => {
  const db = createDatabase(":memory:");
  try {
    const def = graph([node("start", "trigger.manual")], []),
      auto = createAutomation(db.db, "Restart", def);
    const dispatcher = new AgentDispatcher();
    dispatcher.attachDatabase(db.db);
    const attempt = {
      id: "attempt",
      runId: "crashed",
      nodeId: "start",
      agentId: "local",
      status: "running" as const,
      attempt: 0,
      simulated: false,
      pinned: false,
      input: null,
      output: null,
      startedAt: new Date().toISOString(),
      durationMs: 0,
      error: null,
    };
    dispatcher.saveRun({
      id: "crashed",
      automationId: auto.id,
      versionId: "draft",
      mode: "manual",
      status: "running",
      startedAt: attempt.startedAt,
      finishedAt: null,
      error: null,
      nodeExecutions: [],
      definition: def,
    });
    dispatcher.saveNodeExecution(attempt);
    dispatcher.saveRun({
      ...dispatcher.getRun("crashed")!,
      nodeExecutions: [attempt],
    });
    const restarted = new AgentDispatcher();
    restarted.attachDatabase(db.db);
    expect(restarted.getRun("crashed")?.status).toBe("interrupted");
    expect(restarted.getRun("crashed")?.nodeExecutions[0].status).toBe(
      "interrupted",
    );
    expect(restarted.getAllRuns()).toHaveLength(1);
  } finally {
    db.close();
  }
});

test("error automations receive failure events and cycles stop", async () => {
  const db = createDatabase(":memory:");
  try {
    const dispatcher = new AgentDispatcher();
    dispatcher.attachDatabase(db.db);
    const handler = graph(
      [
        node("start", "trigger.manual"),
        node("remember", "state.set", {
          key: "failure",
          valueExpression: "$json.failedRunId",
        }),
      ],
      [edge("start", "remember")],
    );
    const handlerAuto = createAutomation(db.db, "Handler", handler);
    activateAutomation(db.db, handlerAuto.id);
    const def = graph(
      [
        node("start", "trigger.manual"),
        node("fail", "error.throw", { message: "Intentional" }),
      ],
      [edge("start", "fail")],
    );
    def.settings.errorAutomationId = handlerAuto.id;
    const auto = createAutomation(db.db, "Failing", def);
    const run = await runAutomation(db.db, dispatcher, auto.id, {
      mode: "manual",
    });
    expect(run?.status).toBe("error");
    expect(run?.errorHandlerRunId).toBeDefined();
    expect(dispatcher.getState(handlerAuto.id, "failure")).toBe(run!.id);
    def.settings.errorAutomationId = auto.id;
    updateAutomation(db.db, auto.id, def);
    activateAutomation(db.db, auto.id);
    const cycle = await runAutomation(db.db, dispatcher, auto.id, {
      mode: "manual",
    });
    expect(cycle?.errorHandlerError).toContain("cycle");
  } finally {
    db.close();
  }
});

test("activation rejects invalid cron and timezone before scheduling", () => {
  const db = createDatabase(":memory:");
  try {
    const def = graph(
      [
        node("schedule", "trigger.schedule", {
          cron: "invalid",
          timezone: "UTC",
        }),
      ],
      [],
    );
    const auto = createAutomation(db.db, "Bad cron", def);
    expect(() => activateAutomation(db.db, auto.id)).toThrow();
    def.nodes[0].params = { cron: "* * * * *", timezone: "Not/A_Timezone" };
    updateAutomation(db.db, auto.id, def);
    expect(() => activateAutomation(db.db, auto.id)).toThrow();
    expect(
      db.db
        .query<
          { active_version_id: string | null },
          [string]
        >("SELECT active_version_id FROM automations WHERE id=?")
        .get(auto.id)?.active_version_id,
    ).toBeNull();
  } finally {
    db.close();
  }
});
