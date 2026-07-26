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

describe("logic.switch", () => {
  const def = nodeRegistry.lookup("logic.switch", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("logic.switch");
    expect(def.version).toBe(1);
  });

  test("run() routes to matching rule label", async () => {
    const ctx = makeCtx(
      {
        rules: [
          { label: "a", expression: "$json.type === 'A'" },
          { label: "b", expression: "$json.type === 'B'" },
        ],
      },
      [{ json: { type: "A" } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json._branch).toBe("a");
  });

  test("run() routes to second rule when first doesn't match", async () => {
    const ctx = makeCtx(
      {
        rules: [
          { label: "a", expression: "$json.type === 'A'" },
          { label: "b", expression: "$json.type === 'B'" },
        ],
      },
      [{ json: { type: "B" } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json._branch).toBe("b");
  });

  test("run() falls back to default when no rules match", async () => {
    const ctx = makeCtx(
      {
        rules: [{ label: "a", expression: "$json.type === 'A'" }],
        fallback: "other",
      },
      [{ json: { type: "C" } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json._branch).toBe("other");
  });

  test("run() falls back to 'default' when no fallback specified", async () => {
    const ctx = makeCtx(
      { rules: [] },
      [{ json: { type: "X" } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json._branch).toBe("default");
  });

  test("simulate() returns SimulationReport with rule labels", async () => {
    const ctx = makeCtx(
      {
        rules: [
          { label: "a", expression: "true" },
          { label: "b", expression: "false" },
        ],
        fallback: "default",
      },
      [],
    );
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Switch");
    expect(report.wouldDo).toContain("a");
    expect(report.wouldDo).toContain("b");
    expect(report.wouldDo).toContain("default");
  });
});
