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

describe("trigger.polling", () => {
  const def = nodeRegistry.lookup("trigger.polling", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("trigger.polling");
    expect(def.version).toBe(1);
  });

  test("run() with command target returns result", async () => {
    const stateStore: Record<string, unknown> = {};
    const ctx: RunContext = {
      ...makeCtx(
        { intervalSec: 60, targetType: "command", target: "echo hello", stopAfter: 1 },
        [],
      ),
      state: {
        get: (k: string) => stateStore[k],
        set: (k: string, v: unknown) => { stateStore[k] = v; },
      },
    };
    const result = await def.run(ctx);
    expect(result.length).toBe(1);
    expect(result[0].json.targetType).toBe("command");
    expect(result[0].json.changed).toBe(true);
    expect(result[0].json.result.stdout).toContain("hello");
  });

  test("run() detects change on second poll", async () => {
    const stateStore: Record<string, unknown> = {};
    const ctxBase: RunContext = {
      ...makeCtx(
        { intervalSec: 60, targetType: "command", target: "echo hello", stopAfter: 1 },
        [],
      ),
      state: {
        get: (k: string) => stateStore[k],
        set: (k: string, v: unknown) => { stateStore[k] = v; },
      },
    };
    await def.run(ctxBase);
    const result2 = await def.run(ctxBase);
    expect(result2[0].json.changed).toBe(false);
  });

  test("simulate() returns SimulationReport with interval", async () => {
    const ctx = makeCtx(
      { intervalSec: 30, targetType: "url", target: "https://example.com", stopAfter: 10 },
      [],
    );
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Polling Trigger");
    expect(report.wouldDo).toContain("30s");
    expect(report.wouldDo).toContain("url");
  });
});
