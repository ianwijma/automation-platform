import { describe, test, expect } from "bun:test";
import { LocalAgent } from "./local-agent.js";
import { nodeRegistry } from "../core/node-registry.js";
import "../nodes/index.js";

describe("LocalAgent", () => {
  test("agentId is 'local'", () => {
    const agent = new LocalAgent();
    expect(agent.agentId).toBe("local");
  });

  test("send() calls run() for non-side-effecting node (trigger.manual)", async () => {
    const agent = new LocalAgent();
    const node = nodeRegistry.lookup("trigger.manual", 1)!;
    expect(node).toBeDefined();

    const result = await agent.send(
      "exec-1",
      node,
      {},
      [],
      {},
      {},
      false,
      30,
      { get: () => undefined, set: () => {} },
      "run-1",
      "auto-1",
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json).toEqual({});
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  test("send() with dryRun=true calls simulate() when available", async () => {
    const agent = new LocalAgent();
    const node = nodeRegistry.lookup("trigger.manual", 1)!;
    expect(node.simulate).toBeDefined();

    const result = await agent.send(
      "exec-2",
      node,
      {},
      [],
      {},
      {},
      true,
      30,
      { get: () => undefined, set: () => {} },
      "run-2",
      "auto-2",
    );

    expect(result.items).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  test("send() returns {items: [], error: message} when node throws", async () => {
    const agent = new LocalAgent();
    const throwingNode = {
      type: "test.throw",
      version: 1,
      displayName: "Throw Test",
      category: "test",
      sideEffecting: true,
      inputs: [],
      outputs: [],
      paramsSchema: {},
      async run() {
        throw new Error("node exploded");
      },
    };

    const result = await agent.send(
      "exec-3",
      throwingNode,
      {},
      [],
      {},
      {},
      false,
      30,
      { get: () => undefined, set: () => {} },
      "run-3",
      "auto-3",
    );

    expect(result.items).toEqual([]);
    expect(result.error).toBe("node exploded");
  });
});
