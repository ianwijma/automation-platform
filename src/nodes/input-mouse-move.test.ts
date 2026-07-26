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

describe("input.mouse.move", () => {
  const def = nodeRegistry.lookup("input.mouse.move", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("input.mouse.move");
    expect(def.version).toBe(1);
  });

  test("requiredCapabilities includes input", () => {
    expect(def.requiredCapabilities).toBeDefined();
    expect(def.requiredCapabilities!.input).toBe("xdotool");
  });

  test("sideEffecting is true", () => {
    expect(def.sideEffecting).toBe(true);
  });

  test("simulate() returns SimulationReport with coordinates", async () => {
    const ctx = makeCtx({ x: 300, y: 400 }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Mouse Move");
    expect(report.wouldDo).toContain("300");
    expect(report.wouldDo).toContain("400");
  });
});
