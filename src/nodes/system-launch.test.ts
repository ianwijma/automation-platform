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

describe("system.launch", () => {
  const def = nodeRegistry.lookup("system.launch", 1)!;

  test("is registered", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("system.launch");
  });

  test("run() launches a process and returns pid", async () => {
    const ctx = makeCtx({ command: "sleep 5" });
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json.pid).toBeDefined();
    expect(typeof result[0].json.pid).toBe("number");
    expect(result[0].json.pid).toBeGreaterThan(0);

    try { process.kill(result[0].json.pid as number, "SIGKILL"); } catch {}
  });

  test("simulate() returns description", async () => {
    const ctx = makeCtx({ command: "echo test" });
    const report = await def.simulate!(ctx);
    expect(report.description).toContain("Launch");
  });
});
