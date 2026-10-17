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

describe("vision.llm", () => {
  const def = nodeRegistry.lookup("vision.llm", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("vision.llm");
    expect(def.version).toBe(1);
  });

  test("sideEffecting is true", () => {
    expect(def.sideEffecting).toBe(true);
  });

  test("run() throws when no API key is provided", async () => {
    const ctx = makeCtx(
      {
        prompt: "Describe",
        model: "openai/gpt-4o",
        imagePath: "/tmp/test.png",
        apiKey: "",
      },
      [],
    );
    expect(def.run(ctx)).rejects.toThrow("credential");
  });

  test("simulate() returns SimulationReport with model", async () => {
    const ctx = makeCtx(
      {
        prompt: "Describe",
        model: "openai/gpt-4o",
        imagePath: "/tmp/test.png",
        apiKey: "key",
      },
      [],
    );
    const report = (await def.simulate!(ctx)) as SimulationReport;
    expect(report.description).toBe("LLM Vision");
    expect(report.wouldDo).toContain("openai/gpt-4o");
  });
});
