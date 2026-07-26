import { describe, test, expect } from "bun:test";
import type { RunContext, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import "../nodes/index.js";

function makeCtx(params: Record<string, unknown>, items: NodeItem[] = []): RunContext {
  return {
    nodeId: "test-node", nodeName: "Test", params, items,
    env: {}, secrets: {},
    state: { get: () => undefined, set: () => {} },
    now: new Date(), agentId: "local", runId: "test-run", dryRun: false,
  };
}

describe("vision.window.list", () => {
  const def = nodeRegistry.lookup("vision.window.list", 1)!;

  test("is registered", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("vision.window.list");
  });

  test("simulate() returns description", async () => {
    const ctx = makeCtx({ filter: "", pid: 0 });
    const report = await def.simulate!(ctx);
    expect(report.description).toContain("Window");
  });

  const hasDisplay = !!process.env.DISPLAY;
  test.skipIf(!hasDisplay)("run() lists windows on X11", async () => {
    const ctx = makeCtx({ filter: "", pid: 0, includeGeometry: true });
    const result = await def.run(ctx);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].json.windowId).toBeDefined();
    expect(result[0].json.title).toBeDefined();
  });
});
