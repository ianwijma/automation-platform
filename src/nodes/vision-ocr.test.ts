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

describe("vision.ocr", () => {
  const def = nodeRegistry.lookup("vision.ocr", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("vision.ocr");
    expect(def.version).toBe(1);
  });

  test("sideEffecting is false", () => {
    expect(def.sideEffecting).toBe(false);
  });

  test("simulate() returns SimulationReport with engine", async () => {
    const ctx = makeCtx({ imagePath: "/tmp/test.png", lang: "eng", engine: "tesseract" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("OCR");
    expect(report.wouldDo).toContain("tesseract");
  });

  test("simulate() defaults to tesseract engine", async () => {
    const ctx = makeCtx({ imagePath: "/tmp/test.png", lang: "eng" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.wouldDo).toContain("tesseract");
  });
});
