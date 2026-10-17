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

describe("vision.image.detect", () => {
  const def = nodeRegistry.lookup("vision.image.detect", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("vision.image.detect");
    expect(def.version).toBe(1);
  });

  test("requires an image comparison tool", () => {
    expect(def.requiredCapabilities).toBeDefined();
    expect(def.requiredCapabilities!.tools).toContain("compare");
  });

  test("sideEffecting is false", () => {
    expect(def.sideEffecting).toBe(false);
  });

  test("simulate() returns SimulationReport with confidence", async () => {
    const ctx = makeCtx(
      {
        template: "/tmp/button.png",
        confidence: 0.8,
        method: "template-matching",
      },
      [],
    );
    const report = (await def.simulate!(ctx)) as SimulationReport;
    expect(report.description).toBe("Image Detect");
    expect(report.wouldDo).toContain("0.8");
  });
});
