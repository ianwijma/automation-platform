import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "./server.js";
import { createDatabase } from "../db/database.js";
import { WssAgentClient } from "../agent/wss-client.js";
import { nodeRegistry } from "../core/node-registry.js";
import type { AutomationDefinition, AutomationNode } from "../core/types.js";
import "../nodes/index.js";
const node = (
  id: string,
  type: string,
  params = {},
  machine?: string,
): AutomationNode => ({
  id,
  type,
  typeVersion: 1,
  name: id,
  params,
  target: machine ? { kind: "machine", value: machine } : { kind: "local" },
  disabled: false,
  position: { x: 0, y: 0 },
});
const graph = (nodes: AutomationNode[]): AutomationDefinition => ({
  schemaVersion: 1,
  name: "Live integration",
  nodes,
  edges: nodes
    .slice(1)
    .map((n, i) => ({
      id: String(i),
      source: nodes[i].id,
      sourcePort: "out",
      target: n.id,
      targetPort: "in",
    })),
  settings: { runTimeoutSec: 10, savePayloads: true, errorAutomationId: null },
});
async function eventually<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeout = 4000,
): Promise<T> {
  const end = Date.now() + timeout;
  let value: T;
  do {
    value = await read();
    if (ready(value)) return value;
    await Bun.sleep(20);
  } while (Date.now() < end);
  throw new Error(`Timed out: ${JSON.stringify(value!)}`);
}
test("real fleet transport preserves identity, state, artifacts, and agent attribution", async () => {
  const dir = mkdtempSync("/tmp/ap-fleet-live-");
  const db = createDatabase(`${dir}/db.sqlite`);
  const config = {
    host: "127.0.0.1",
    port: 0,
    mode: "standalone" as const,
    dataDir: dir,
    dbPath: `${dir}/db.sqlite`,
    noBrowser: true,
    publicUrl: null,
  };
  const server = createServer({ port: 0, host: config.host, db, config }),
    url = `http://127.0.0.1:${server.server.port}`;
  const api = async (
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<any> => {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result;
  };
  let identity = "",
    client: WssAgentClient | undefined;
  nodeRegistry.register({
    type: "test.artifact.write",
    version: 1,
    category: "test",
    displayName: "Fixture",
    inputs: [{ name: "in", type: "item" }],
    outputs: [{ name: "out", type: "item" }],
    paramsSchema: {},
    sideEffecting: false,
    async run(ctx) {
      const ref = await ctx.artifacts!.store(
        Buffer.from("cross-machine-artifact"),
        "text/plain",
        "fixture.txt",
      );
      return [{ json: {}, binary: { file: ref } }];
    },
  });
  nodeRegistry.register({
    type: "test.artifact.read",
    version: 1,
    category: "test",
    displayName: "Fixture read",
    inputs: [{ name: "in", type: "item" }],
    outputs: [{ name: "out", type: "item" }],
    paramsSchema: {},
    sideEffecting: false,
    async run(ctx) {
      return [
        {
          json: {
            text: Buffer.from(
              await ctx.artifacts!.read!(ctx.items[0].binary!.file),
            ).toString(),
          },
        },
      ];
    },
  });
  try {
    const token = await api("/api/agents/join-tokens", "POST", { uses: 1 });
    client = new WssAgentClient({
      name: "Fixture",
      version: "0.1.0",
      token: token.token,
      onIdentity: (value) => {
        identity = value;
      },
    });
    await client.connect(url);
    const agents = await api("/api/agents"),
      remote = agents.find((a: any) => !a.isLocal);
    expect(remote).toBeDefined();
    expect(identity).not.toBe(token.token);
    await api(`/api/agents/${remote.id}/tags`, "PUT", { tags: ["test"] });
    const def = graph([
      node("start", "trigger.manual"),
      node(
        "write",
        "state.set",
        { key: "value", valueExpression: "42" },
        remote.id,
      ),
      node("read", "state.get", { key: "value" }),
      node("artifact", "test.artifact.write", {}, remote.id),
      node("readLocal", "test.artifact.read"),
      node("artifactLocal", "test.artifact.write"),
      node("readRemote", "test.artifact.read", {}, remote.id),
    ]);
    const auto = await api("/api/automations", "POST", {
      name: def.name,
      definition: def,
    });
    const accepted = await api(`/api/automations/${auto.id}/run`, "POST", {});
    const run = await eventually(
      () => api(`/api/runs/${accepted.id}`),
      (r) => !["running", "queued"].includes(r.status),
    );
    expect(run.status).toBe("success");
    expect(
      run.nodeExecutions.find((n: any) => n.nodeId === "read").output[0].json
        .state_value,
    ).toBe(42);
    expect(
      run.nodeExecutions.find((n: any) => n.nodeId === "readLocal").output[0]
        .json.text,
    ).toBe("cross-machine-artifact");
    expect(run.nodeExecutions.at(-1).output[0].json.text).toBe(
      "cross-machine-artifact",
    );
    expect(run.nodeExecutions.at(-1).agentId).toBe(remote.id);
    client.disconnect();
    await eventually(
      () => api("/api/agents"),
      (agents) =>
        agents.find((a: any) => a.id === remote.id)?.status === "offline",
    );
    client = new WssAgentClient({
      name: "Renamed fixture",
      version: "0.1.0",
      token: identity,
    });
    await client.connect(url);
    const reconnected = (await api("/api/agents")).find((a: any) => !a.isLocal);
    expect(reconnected.id).toBe(remote.id);
    expect(reconnected.tags).toEqual(["test"]);
    await api(`/api/agents/${remote.id}`, "DELETE");
    client.disconnect();
    expect(
      (
        db.db
          .query("SELECT identity_hash FROM agents WHERE id=?")
          .get(remote.id) as { identity_hash: string | null }
      ).identity_hash,
    ).toBeNull();
  } finally {
    client?.disconnect();
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);

test("activated polling runs unattended, reacts to change, and stops after deactivation", async () => {
  const dir = mkdtempSync("/tmp/ap-triggers-live-");
  const db = createDatabase(`${dir}/db.sqlite`);
  const config = {
    host: "127.0.0.1",
    port: 0,
    mode: "standalone" as const,
    dataDir: dir,
    dbPath: `${dir}/db.sqlite`,
    noBrowser: true,
    publicUrl: null,
  };
  const server = createServer({ port: 0, host: config.host, db, config }),
    url = `http://127.0.0.1:${server.server.port}`;
  const api = async (
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<any> =>
    (
      await fetch(url + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    ).json();
  await Bun.write(`${dir}/value`, "first");
  try {
    const def = graph([
      node("poll", "trigger.polling", {
        targetType: "command",
        target: `cat '${dir}/value'`,
        intervalSec: 0.1,
      }),
      node("save", "state.set", {
        key: "changed",
        valueExpression: "$json.result.stdout",
      }),
    ]);
    const auto = await api("/api/automations", "POST", {
      name: def.name,
      definition: def,
    });
    await api(`/api/automations/${auto.id}/activate`, "POST");
    const read = () =>
      Promise.resolve(
        db.db
          .query<
            { value_json: string },
            [string]
          >("SELECT value_json FROM state WHERE key=?")
          .get("changed")?.value_json,
      );
    await eventually(read, (v) => v === '"first"');
    await Bun.write(`${dir}/value`, "second");
    await eventually(read, (v) => v === '"second"');
    await api(`/api/automations/${auto.id}/deactivate`, "POST");
    const before = (await api(`/api/runs?automationId=${auto.id}`)).length;
    await Bun.sleep(250);
    expect((await api(`/api/runs?automationId=${auto.id}`)).length).toBe(
      before,
    );
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 10000);
