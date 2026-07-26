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

describe("logic.code", () => {
  const def = nodeRegistry.lookup("logic.code", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("logic.code");
    expect(def.version).toBe(1);
  });

  test("run() executes code that returns items array", async () => {
    const ctx = makeCtx(
      {
        language: "javascript",
        code: 'return ctx.items.map(i => ({ json: { ...i.json, processed: true } }));',
      },
      [{ json: { value: 1 } }],
    );
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json.processed).toBe(true);
    expect(result[0].json.value).toBe(1);
  });

  test("run() throws if code returns non-array", async () => {
    const ctx = makeCtx(
      { language: "javascript", code: 'return "not an array";' },
      [],
    );
    expect(def.run(ctx)).rejects.toThrow("Code must return an array of items");
  });

  test("run() with no code passes items through", async () => {
    const ctx = makeCtx(
      { language: "javascript", code: "" },
      [{ json: { x: 1 } }],
    );
    const result = await def.run(ctx);
    expect(result).toEqual([{ json: { x: 1 } }]);
  });

  test("run() wraps plain objects as NodeItem", async () => {
    const ctx = makeCtx(
      { language: "javascript", code: 'return [{ foo: "bar" }];' },
      [],
    );
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json).toEqual({ foo: "bar" });
  });

  test("simulate() returns SimulationReport", async () => {
    const ctx = makeCtx(
      { language: "javascript", code: "return [];" },
      [],
    );
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Code");
    expect(report.wouldDo).toContain("execute user code");
  });
});
