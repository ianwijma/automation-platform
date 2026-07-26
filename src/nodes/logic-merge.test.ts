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

describe("logic.merge", () => {
  const def = nodeRegistry.lookup("logic.merge", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("logic.merge");
    expect(def.version).toBe(1);
  });

  test("run() in append mode merges all items", async () => {
    const items: NodeItem[] = [
      { json: { id: 1, source: "a" } },
      { json: { id: 2, source: "b" } },
    ];
    const ctx = makeCtx({ mode: "append" }, items);
    const result = await def.run(ctx);
    expect(result.length).toBe(2);
  });

  test("run() in keep-key mode deduplicates by key field", async () => {
    const items: NodeItem[] = [
      { json: { id: 1, val: "first" } },
      { json: { id: 2, val: "second" } },
      { json: { id: 1, val: "third" } },
    ];
    const ctx = makeCtx({ mode: "keep-key", keyField: "id" }, items);
    const result = await def.run(ctx);
    expect(result.length).toBe(2);
    const ids = result.map((r) => r.json.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });

  test("run() defaults to append mode", async () => {
    const items: NodeItem[] = [
      { json: { id: 1 } },
      { json: { id: 2 } },
    ];
    const ctx = makeCtx({}, items);
    const result = await def.run(ctx);
    expect(result.length).toBe(2);
  });

  test("simulate() returns SimulationReport with item count", async () => {
    const items: NodeItem[] = [{ json: {} }, { json: {} }, { json: {} }];
    const ctx = makeCtx({ mode: "append" }, items);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Merge");
    expect(report.wouldDo).toContain("3 items");
    expect(report.wouldDo).toContain("append");
  });
});
