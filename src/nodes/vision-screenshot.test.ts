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

describe("vision.screenshot", () => {
  const def = nodeRegistry.lookup("vision.screenshot", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("vision.screenshot");
    expect(def.version).toBe(1);
  });

  test("requiredCapabilities includes screen", () => {
    expect(def.requiredCapabilities).toBeDefined();
    expect(def.requiredCapabilities!.screen).toBe(true);
  });

  test("sideEffecting is true", () => {
    expect(def.sideEffecting).toBe(true);
  });

  test("simulate() returns SimulationReport", async () => {
    const ctx = makeCtx({ display: "current" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Screenshot");
    expect(report.wouldDo).toContain("capture");
  });
});
