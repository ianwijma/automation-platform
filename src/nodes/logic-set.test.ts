import { describe, test, expect } from "bun:test";
import type {
  RunContext,
  NodeItem,
  SimulationReport,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import "../nodes/index.js";

function makeCtx(
  params: Record<string, unknown>,
  items: NodeItem[] = [],
): RunContext {
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

describe("logic.set", () => {
  const def = nodeRegistry.lookup("logic.set", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("logic.set");
    expect(def.version).toBe(1);
  });

  test("run() sets static field values", async () => {
    const ctx = makeCtx(
      { assignments: [{ field: "status", value: "active" }] },
      [{ json: { name: "test" } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json.status).toBe("active");
    expect(result[0].json.name).toBe("test");
  });

  test("run() sets expression field values", async () => {
    const ctx = makeCtx(
      { assignments: [{ field: "doubled", value: "{{$json.value * 2}}" }] },
      [{ json: { value: 5 } }],
    );
    const result = await def.run(ctx);
    expect(result[0].json.doubled).toBe(10);
  });

  test("run() handles multiple assignments", async () => {
    const ctx = makeCtx(
      {
        assignments: [
          { field: "a", value: "1" },
          { field: "b", value: "2" },
        ],
      },
      [{ json: {} }],
    );
    const result = await def.run(ctx);
    expect(result[0].json.a).toBe("1");
    expect(result[0].json.b).toBe("2");
  });

  test("run() with no assignments passes items through", async () => {
    const ctx = makeCtx({ assignments: [] }, [{ json: { existing: true } }]);
    const result = await def.run(ctx);
    expect(result[0].json.existing).toBe(true);
  });

  test("simulate() returns SimulationReport", async () => {
    const ctx = makeCtx({ assignments: [{ field: "x", value: "1" }] }, [
      { json: {} },
    ]);
    const report = (await def.simulate!(ctx)) as SimulationReport;
    expect(report.description).toBe("Set Fields");
    expect(report.wouldDo).toContain("1 field(s)");
  });
});
