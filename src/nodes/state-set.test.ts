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

describe("state.set", () => {
  const def = nodeRegistry.lookup("state.set", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("state.set");
    expect(def.version).toBe(1);
  });

  test("run() sets state value and passes items through", async () => {
    const stateStore: Record<string, unknown> = {};
    const ctx: RunContext = {
      ...makeCtx(
        { key: "counter", valueExpression: "42" },
        [{ json: { name: "test" } }],
      ),
      state: {
        get: (k: string) => stateStore[k],
        set: (k: string, v: unknown) => { stateStore[k] = v; },
      },
    };
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(stateStore["counter"]).toBe(42);
  });

  test("run() evaluates expression against item data", async () => {
    const stateStore: Record<string, unknown> = {};
    const ctx: RunContext = {
      ...makeCtx(
        { key: "doubled", valueExpression: "$json.value * 2" },
        [{ json: { value: 5 } }],
      ),
      state: {
        get: (k: string) => stateStore[k],
        set: (k: string, v: unknown) => { stateStore[k] = v; },
      },
    };
    await def.run(ctx);
    expect(stateStore["doubled"]).toBe(10);
  });

  test("simulate() returns SimulationReport with key", async () => {
    const ctx = makeCtx({ key: "myKey", valueExpression: "1" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Set State");
    expect(report.wouldDo).toContain("myKey");
  });
});
