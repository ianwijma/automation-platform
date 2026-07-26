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

describe("error.throw", () => {
  const def = nodeRegistry.lookup("error.throw", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("error.throw");
    expect(def.version).toBe(1);
  });

  test("run() throws with the provided message", async () => {
    const ctx = makeCtx({ message: "Something went wrong" }, []);
    expect(def.run(ctx)).rejects.toThrow("Something went wrong");
  });

  test("run() throws Error instance", async () => {
    const ctx = makeCtx({ message: "test error" }, []);
    try {
      await def.run(ctx);
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  test("simulate() returns SimulationReport with message", async () => {
    const ctx = makeCtx({ message: "Oops" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Throw Error");
    expect(report.wouldDo).toContain("Oops");
  });
});
