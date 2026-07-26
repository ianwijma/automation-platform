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

describe("logic.if", () => {
  const def = nodeRegistry.lookup("logic.if", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("logic.if");
    expect(def.version).toBe(1);
  });

  test("run() routes to true branch when condition is truthy", async () => {
    const ctx = makeCtx(
      { condition: "1 === 1" },
      [{ json: { value: 42 } }],
    );
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json._branch).toBe("true");
  });

  test("run() routes to false branch when condition is falsy", async () => {
    const ctx = makeCtx(
      { condition: "1 === 2" },
      [{ json: { value: 42 } }],
    );
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json._branch).toBe("false");
  });

  test("run() preserves original json fields", async () => {
    const ctx = makeCtx(
      { condition: "1 === 1" },
      [{ json: { value: 42 } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json.value).toBe(42);
  });

  test("run() handles multiple items", async () => {
    const ctx = makeCtx(
      { condition: "1 === 1" },
      [{ json: { a: 1 } }, { json: { b: 2 } }],
    );
    const result = await def.run(ctx);
    expect(result.length).toBe(2);
    expect(result.every((item) => item.json._branch === "true")).toBe(true);
  });

  test("simulate() returns SimulationReport with condition", async () => {
    const ctx = makeCtx({ condition: "1 === 1" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report).toHaveProperty("description");
    expect(report).toHaveProperty("wouldDo");
    expect(report.wouldDo).toContain("1 === 1");
  });
});
