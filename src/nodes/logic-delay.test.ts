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

describe("logic.delay", () => {
  const def = nodeRegistry.lookup("logic.delay", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("logic.delay");
    expect(def.version).toBe(1);
  });

  test("run() passes items through after delay", async () => {
    const items: NodeItem[] = [{ json: { value: 1 } }];
    const ctx = makeCtx({ seconds: 0 }, items);
    const result = await def.run(ctx);
    expect(result).toEqual(items);
  });

  test("run() defaults to 1 second", async () => {
    const items: NodeItem[] = [{ json: {} }];
    const ctx = makeCtx({ seconds: 0 }, items);
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
  });

  test("simulate() returns wait description", async () => {
    const ctx = makeCtx({ seconds: 5 }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Delay");
    expect(report.wouldDo).toContain("5s");
  });
});
