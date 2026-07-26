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

describe("trigger.manual", () => {
  const def = nodeRegistry.lookup("trigger.manual", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("trigger.manual");
    expect(def.version).toBe(1);
  });

  test("run() returns empty json item", async () => {
    const ctx = makeCtx({});
    const result = await def.run(ctx);
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(1);
    expect(result[0].json).toEqual({});
  });

  test("simulate() returns SimulationReport", async () => {
    const ctx = makeCtx({});
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report).toHaveProperty("description");
    expect(report).toHaveProperty("wouldDo");
    expect(report.description).toBe("Manual trigger");
  });
});
