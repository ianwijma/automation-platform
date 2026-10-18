import { describe, test, expect, beforeAll } from "bun:test";
import { ExecutionEngine } from "./execution-engine.js";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { nodeRegistry } from "./node-registry.js";
import "../nodes/index.js";
import type { AutomationDefinition } from "./types.js";

const MIXED_EXEC_DEFINITION: AutomationDefinition = {
  schemaVersion: 1,
  name: "Mixed Execution Test",
  settings: {
    runTimeoutSec: 3600,
    savePayloads: true,
    errorAutomationId: null,
  },
  nodes: [
    {
      id: "n1",
      type: "trigger.manual",
      typeVersion: 1,
      name: "Start",
      target: { kind: "local" },
      params: {},
      disabled: false,
      position: { x: 0, y: 0 },
    },
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "Fetch metrics from remote A",
      target: { kind: "local" },
      params: { command: "echo 'metrics-output'" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
    {
      id: "n3",
      type: "system.command",
      typeVersion: 1,
      name: "Fetch from remote B",
      target: { kind: "local" },
      params: { command: "echo 'screen-data'" },
      disabled: false,
      position: { x: 400, y: 0 },
    },
    {
      id: "n4",
      type: "logic.if",
      typeVersion: 1,
      name: "Check metrics",
      target: { kind: "local" },
      params: { condition: "$json.stdout !== undefined" },
      disabled: false,
      position: { x: 600, y: 0 },
    },
    {
      id: "n5",
      type: "system.command",
      typeVersion: 1,
      name: "Follow-up on A",
      target: { kind: "local" },
      params: { command: "echo 'follow-up'" },
      disabled: false,
      position: { x: 800, y: 0 },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      sourcePort: "out",
      target: "n2",
      targetPort: "in",
    },
    {
      id: "e2",
      source: "n2",
      sourcePort: "out",
      target: "n3",
      targetPort: "in",
    },
    {
      id: "e3",
      source: "n3",
      sourcePort: "out",
      target: "n4",
      targetPort: "in",
    },
    {
      id: "e4",
      source: "n4",
      sourcePort: "true",
      target: "n5",
      targetPort: "in",
    },
  ],
};

describe("M10 — Hardening & E2E", () => {
  let engine: ExecutionEngine;
  let dispatcher: AgentDispatcher;

  beforeAll(() => {
    dispatcher = new AgentDispatcher();
    engine = new ExecutionEngine(dispatcher);
  });

  test("mixed-execution scenario: local trigger → command → command → if → follow-up", async () => {
    const run = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "mixed-test-1",
      "v1",
      {
        mode: "manual",
      },
    );

    expect(run.status).toBe("success");
    expect(run.nodeExecutions.length).toBe(5);

    const trigger = run.nodeExecutions.find((n) => n.nodeId === "n1");
    const cmd1 = run.nodeExecutions.find((n) => n.nodeId === "n2");
    const cmd2 = run.nodeExecutions.find((n) => n.nodeId === "n3");
    const ifNode = run.nodeExecutions.find((n) => n.nodeId === "n4");
    const followup = run.nodeExecutions.find((n) => n.nodeId === "n5");

    expect(trigger?.status).toBe("success");
    expect(cmd1?.status).toBe("success");
    expect(cmd1?.agentId).toBe("local");
    expect(cmd1?.output?.[0]?.json?.stdout).toBe("metrics-output\n");

    expect(cmd2?.status).toBe("success");
    expect(cmd2?.agentId).toBe("local");
    expect(cmd2?.output?.[0]?.json?.stdout).toBe("screen-data\n");

    expect(ifNode?.status).toBe("success");
    expect(ifNode?.output?.[0]?.json?._branch).toBe("true");

    expect(followup?.status).toBe("success");
    expect(followup?.agentId).toBe("local");
    expect(followup?.output?.[0]?.json?.stdout).toBe("follow-up\n");
  });

  test("no special-casing: all nodes use same agentId when running locally", async () => {
    const run = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "mixed-test-2",
      "v1",
      {
        mode: "manual",
      },
    );

    expect(run.status).toBe("success");
    for (const ne of run.nodeExecutions) {
      expect(ne.agentId).toBe("local");
    }
  });

  test("payload retention toggle: savePayloads=false stores no I/O", async () => {
    const noPayloadDefinition: AutomationDefinition = {
      ...MIXED_EXEC_DEFINITION,
      settings: { ...MIXED_EXEC_DEFINITION.settings, savePayloads: false },
    };

    const run = await engine.execute(
      noPayloadDefinition,
      "mixed-test-3",
      "v1",
      {
        mode: "manual",
      },
    );

    expect(run.status).toBe("success");

    for (const ne of run.nodeExecutions) {
      expect(ne.input).toBeNull();
      expect(ne.output).toBeNull();
    }
  });

  test("re-run-from-node using recorded data", async () => {
    const originalRun = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "mixed-test-4",
      "v1",
      {
        mode: "manual",
      },
    );

    expect(originalRun.status).toBe("success");
    expect(originalRun.nodeExecutions.length).toBe(5);

    const cmd1Output = originalRun.nodeExecutions.find(
      (n) => n.nodeId === "n2",
    )?.output;
    expect(cmd1Output).toBeDefined();
    expect(cmd1Output?.[0]?.json?.stdout).toBe("metrics-output\n");

    const rerunResult = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "mixed-test-4",
      "v1",
      {
        mode: "partial",
        fromNodeId: "n2",
        pinData: {
          n1: originalRun.nodeExecutions.find((n) => n.nodeId === "n1")!
            .output!,
        },
      },
    );

    expect(rerunResult.status).toBe("success");
    expect(rerunResult.nodeExecutions.length).toBe(4);

    const cmd1 = rerunResult.nodeExecutions.find((n) => n.nodeId === "n2");
    expect(cmd1?.status).toBe("success");

    const ifNode = rerunResult.nodeExecutions.find((n) => n.nodeId === "n4");
    expect(ifNode?.status).toBe("success");
    expect(ifNode?.output?.[0]?.json?._branch).toBe("true");

    const followup = rerunResult.nodeExecutions.find((n) => n.nodeId === "n5");
    expect(followup?.status).toBe("success");
  });

  test("dry-run simulates actions and evaluates pure logic", async () => {
    const run = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "mixed-test-5",
      "v1",
      {
        mode: "dry",
        dryRun: true,
      },
    );

    expect(run.status).toBe("success");

    const cmd1 = run.nodeExecutions.find((n) => n.nodeId === "n2");
    expect(cmd1?.simulated).toBe(true);

    const ifNode = run.nodeExecutions.find((n) => n.nodeId === "n4");
    expect(ifNode?.simulated).toBe(false);
  });

  test("nodeScope 'single' executes only the target node", async () => {
    const run = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "scope-single-1",
      "v1",
      {
        mode: "partial",
        fromNodeId: "n2",
        nodeScope: "single",
        pinData: { n1: [{ json: { test: true } }] },
      },
    );
    expect(run.status).toBe("success");
    expect(run.nodeExecutions.length).toBe(1);
    expect(run.nodeExecutions[0].nodeId).toBe("n2");
    expect(run.nodeExecutions[0].simulated).toBe(false);
  });

  test("nodeScope 'to' executes upstream + target, not downstream", async () => {
    const run = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "scope-to-1",
      "v1",
      {
        mode: "partial",
        fromNodeId: "n4",
        nodeScope: "to",
      },
    );
    expect(run.status).toBe("success");
    const executedIds = run.nodeExecutions.map((ne) => ne.nodeId);
    expect(executedIds).toContain("n1");
    expect(executedIds).toContain("n2");
    expect(executedIds).toContain("n4");
    expect(executedIds).not.toContain("n5");
  });

  test("nodeScope 'from' (default) executes from node onward", async () => {
    const run = await engine.execute(
      MIXED_EXEC_DEFINITION,
      "scope-from-1",
      "v1",
      {
        mode: "partial",
        fromNodeId: "n4",
        nodeScope: "from",
        inputData: [{ json: { stdout: "hello" } }],
      },
    );
    expect(run.status).toBe("success");
    const executedIds = run.nodeExecutions.map((ne) => ne.nodeId);
    expect(executedIds).toContain("n4");
    expect(executedIds).toContain("n5");
    expect(executedIds).not.toContain("n2");
  });

  test("error path: command fails and run errors", async () => {
    const failingDefinition: AutomationDefinition = {
      schemaVersion: 1,
      name: "Failing Test",
      settings: {
        runTimeoutSec: 3600,
        savePayloads: true,
        errorAutomationId: null,
      },
      nodes: [
        {
          id: "n1",
          type: "trigger.manual",
          typeVersion: 1,
          name: "Start",
          target: { kind: "local" },
          params: {},
          disabled: false,
          position: { x: 0, y: 0 },
        },
        {
          id: "n2",
          type: "error.throw",
          typeVersion: 1,
          name: "Fail",
          target: { kind: "local" },
          params: { message: "intentional error" },
          retry: { attempts: 1, backoffSec: [0] },
          disabled: false,
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          sourcePort: "out",
          target: "n2",
          targetPort: "in",
        },
      ],
    };

    const run = await engine.execute(failingDefinition, "fail-test-1", "v1", {
      mode: "manual",
    });

    expect(run.status).toBe("error");
    expect(run.error).toContain("intentional error");
  });
});
