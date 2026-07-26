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

describe("logic.loop", () => {
  const def = nodeRegistry.lookup("logic.loop", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("logic.loop");
    expect(def.version).toBe(1);
  });

  test("run() batches items and adds loop index", async () => {
    const items: NodeItem[] = [
      { json: { name: "a" } },
      { json: { name: "b" } },
      { json: { name: "c" } },
    ];
    const ctx = makeCtx({ batchSize: 1 }, items);
    const result = await def.run(ctx);
    const batched = result.filter((r) => r.json._loopIndex !== undefined);
    expect(batched.length).toBe(3);
    expect(batched[0].json._loopIndex).toBe(0);
    expect(batched[1].json._loopIndex).toBe(1);
    expect(batched[2].json._loopIndex).toBe(2);
  });

  test("run() includes done branch items", async () => {
    const items: NodeItem[] = [{ json: { name: "a" } }];
    const ctx = makeCtx({ batchSize: 1 }, items);
    const result = await def.run(ctx);
    const done = result.filter((r) => r.json._branch === "done");
    expect(done.length).toBe(1);
  });

  test("run() with batchSize > 1 groups correctly", async () => {
    const items: NodeItem[] = [
      { json: { name: "a" } },
      { json: { name: "b" } },
      { json: { name: "c" } },
      { json: { name: "d" } },
    ];
    const ctx = makeCtx({ batchSize: 2 }, items);
    const result = await def.run(ctx);
    const batched = result.filter((r) => r.json._loopIndex !== undefined);
    expect(batched.length).toBe(4);
    const indices = batched.map((r) => r.json._loopIndex);
    expect(indices).toEqual([0, 0, 1, 1]);
  });

  test("simulate() returns correct batch count", async () => {
    const items: NodeItem[] = [
      { json: {} },
      { json: {} },
      { json: {} },
    ];
    const ctx = makeCtx({ batchSize: 2 }, items);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Loop");
    expect(report.wouldDo).toContain("3 items");
    expect(report.wouldDo).toContain("2 batches");
  });
});
