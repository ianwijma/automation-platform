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

describe("trigger.schedule", () => {
  const def = nodeRegistry.lookup("trigger.schedule", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("trigger.schedule");
    expect(def.version).toBe(1);
  });

  test("run() returns trigger metadata with cron", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const ctx: RunContext = {
      ...makeCtx({ cron: "0 * * * *", timezone: "UTC" }, []),
      now,
    };
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json.cron).toBe("0 * * * *");
    expect(result[0].json.triggeredAt).toBe(now.toISOString());
  });

  test("simulate() returns SimulationReport with cron", async () => {
    const ctx = makeCtx({ cron: "*/5 * * * *", timezone: "UTC" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Schedule Trigger");
    expect(report.wouldDo).toContain("*/5 * * * *");
  });
});
