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

describe("state.get", () => {
  const def = nodeRegistry.lookup("state.get", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("state.get");
    expect(def.version).toBe(1);
  });

  test("run() reads state and adds it to items", async () => {
    const stateGet = (_key: string) => "stored-value";
    const ctx: RunContext = {
      ...makeCtx({ key: "myKey" }, [{ json: { name: "test" } }]),
      state: { get: stateGet, set: () => {} },
    };
    const result = await def.run(ctx);
    expect(result[0].json["state_myKey"]).toBe("stored-value");
  });

  test("run() returns undefined when key not found", async () => {
    const ctx: RunContext = {
      ...makeCtx({ key: "missing" }, [{ json: {} }]),
      state: { get: () => undefined, set: () => {} },
    };
    const result = await def.run(ctx);
    expect(result[0].json["state_missing"]).toBeUndefined();
  });

  test("run() preserves existing item fields", async () => {
    const ctx: RunContext = {
      ...makeCtx({ key: "k" }, [{ json: { existing: true } }]),
      state: { get: () => "val", set: () => {} },
    };
    const result = await def.run(ctx);
    expect(result[0].json.existing).toBe(true);
  });

  test("simulate() returns SimulationReport with key", async () => {
    const ctx = makeCtx({ key: "myKey" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Get State");
    expect(report.wouldDo).toContain("myKey");
  });
});
