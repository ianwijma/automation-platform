import { describe, test, expect, beforeEach } from "bun:test";
import { NodeRegistry, nodeRegistry } from "./node-registry.js";
import type { NodeDefinition } from "./node-contract.js";
import "../nodes/index.js";

const MOCK_NODE: NodeDefinition = {
  type: "test.mock",
  version: 1,
  displayName: "Mock Node",
  category: "test",
  sideEffecting: false,
  inputs: [],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {},
  run: async () => [],
};

const MOCK_NODE_V2: NodeDefinition = {
  type: "test.mock",
  version: 2,
  displayName: "Mock Node V2",
  category: "test",
  sideEffecting: false,
  inputs: [],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {},
  run: async () => [],
};

describe("NodeRegistry", () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  test("register a node and lookup by type+version", () => {
    registry.register(MOCK_NODE);
    const found = registry.lookup("test.mock", 1);
    expect(found).toBeDefined();
    expect(found!.type).toBe("test.mock");
    expect(found!.version).toBe(1);
  });

  test("lookup non-existent node returns undefined", () => {
    const found = registry.lookup("nonexistent.node", 1);
    expect(found).toBeUndefined();
  });

  test("register duplicate throws", () => {
    registry.register(MOCK_NODE);
    expect(() => registry.register(MOCK_NODE)).toThrow(/already registered/);
  });

  test("lookup without version returns latest", () => {
    registry.register(MOCK_NODE);
    registry.register(MOCK_NODE_V2);
    const found = registry.lookup("test.mock");
    expect(found).toBeDefined();
    expect(found!.version).toBe(2);
  });

  test("all returns all registered nodes", () => {
    registry.register(MOCK_NODE);
    registry.register(MOCK_NODE_V2);
    const all = registry.all();
    expect(all.length).toBe(2);
  });

  test("byCategory groups nodes", () => {
    registry.register(MOCK_NODE);
    const cats = registry.byCategory();
    expect(cats.test).toBeDefined();
    expect(cats.test.length).toBe(1);
  });
});

describe("Global nodeRegistry — all built-in nodes", () => {
  test("has nodes registered after importing ../nodes/index.js", () => {
    const all = nodeRegistry.all();
    expect(all.length).toBeGreaterThan(0);
  });

  test("all registered nodes have required fields", () => {
    for (const def of nodeRegistry.all()) {
      expect(def.type).toBeTruthy();
      expect(def.version).toBeGreaterThanOrEqual(1);
      expect(def.displayName).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(typeof def.sideEffecting).toBe("boolean");
      expect(typeof def.run).toBe("function");
    }
  });

  test("trigger.manual is registered", () => {
    expect(nodeRegistry.lookup("trigger.manual", 1)).toBeDefined();
  });

  test("system.command is registered", () => {
    expect(nodeRegistry.lookup("system.command", 1)).toBeDefined();
  });

  test("logic.if is registered", () => {
    expect(nodeRegistry.lookup("logic.if", 1)).toBeDefined();
  });
});
