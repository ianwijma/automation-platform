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

describe("system.command", () => {
  const def = nodeRegistry.lookup("system.command", 1)!;

  test("is registered with correct type and version", () => {
    expect(def).toBeDefined();
    expect(def.type).toBe("system.command");
    expect(def.version).toBe(1);
  });

  test("run() executes echo hello and returns stdout", async () => {
    const ctx = makeCtx({ command: "echo hello" }, []);
    const result = await def.run(ctx);
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(1);
    expect(result[0].json.stdout).toContain("hello");
    expect(result[0].json.exitCode).toBe(0);
  });

  test("run() captures stderr for failed commands", async () => {
    const ctx = makeCtx({ command: "ls /nonexistent_dir_xyz" }, []);
    const result = await def.run(ctx);
    expect(result[0].json.exitCode).not.toBe(0);
    expect(result[0].json._branch).toBe("error");
  });

  test("simulate() returns SimulationReport with command", async () => {
    const ctx = makeCtx({ command: "echo hello" }, []);
    const report = await def.simulate!(ctx) as SimulationReport;
    expect(report.description).toBe("Execute Command");
    expect(report.wouldDo).toContain("echo hello");
  });
});
