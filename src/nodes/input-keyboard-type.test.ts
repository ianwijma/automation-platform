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

describe("input.keyboard.type", () => {
  const def = nodeRegistry.lookup("input.keyboard.type", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("input.keyboard.type");
    expect(def.version).toBe(1);
  });

  test("requiredCapabilities includes input", () => {
    expect(def.requiredCapabilities).toBeDefined();
    expect(def.requiredCapabilities!.input).toBe("xdotool");
  });

  test("sideEffecting is true", () => {
    expect(def.sideEffecting).toBe(true);
  });

  test("simulate() returns SimulationReport with text", async () => {
    const ctx = makeCtx({ text: "hello world", delay: 12 }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Keyboard Type");
    expect(report.wouldDo).toContain("hello world");
  });
});
