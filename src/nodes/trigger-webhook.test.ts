import { describe, test, expect } from "bun:test";
import type { RunContext, NodeItem, SimulationReport } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import "../nodes/index.js";

function makeCtx(params: Record<string, unknown>, items: NodeItem[] = []): RunContext {
  return {
    nodeId: "test-node",
    nodeName: "Test",
    params,
    items,
    env: {},
    secrets: {},
    state: { get: () => undefined, set: () => {} },
    now: new Date(),
    agentId: "local",
    runId: "test-run",
    dryRun: false,
  };
}

describe("trigger.webhook", () => {
  const def = nodeRegistry.lookup("trigger.webhook", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("trigger.webhook");
    expect(def.version).toBe(1);
  });

  test("run() returns trigger metadata with webhook info", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const ctx: RunContext = {
      ...makeCtx({ path: "my-hook", method: "POST" }, []),
      now,
    };
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json.webhookPath).toBe("my-hook");
    expect(result[0].json.method).toBe("POST");
    expect(result[0].json.triggeredAt).toBe(now.toISOString());
  });

  test("run() includes webhook body from items", async () => {
    const ctx = makeCtx(
      { path: "my-hook", method: "POST" },
      [{ json: { payload: "data" } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json.body).toEqual({ payload: "data" });
  });

  test("simulate() returns SimulationReport with path", async () => {
    const ctx = makeCtx({ path: "my-hook", method: "POST" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Webhook Trigger");
    expect(report.wouldDo).toContain("my-hook");
    expect(report.wouldDo).toContain("POST");
  });
});
