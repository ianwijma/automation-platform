import { describe, test, expect } from "bun:test";
import { AiService } from "../src/api/ai-service.js";
import type { AutomationDefinition, AutomationNode, AutomationEdge, AutomationSettings } from "../src/core/types.js";
import type { AiDiff } from "../src/core/api-types.js";

const BASE_DEFINITION: AutomationDefinition = {
  schemaVersion: 1,
  name: "Test Automation",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1",
      type: "trigger.manual",
      typeVersion: 1,
      name: "Start",
      target: { kind: "local" },
      params: {},
      disabled: false,
      position: { x: 0, y: 0 },
    },
    {
      id: "n2",
      type: "logic.delay",
      typeVersion: 1,
      name: "Wait",
      target: { kind: "local" },
      params: { delaySec: 5 },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      sourcePort: "out",
      target: "n2",
      targetPort: "in",
    },
  ],
};

describe("AiService", () => {
  test("constructor sets properties", () => {
    const service = new AiService("test-key", "openai/gpt-4o-mini");
    expect(service).toBeDefined();

    const serviceWithEndpoint = new AiService("test-key", "openai/gpt-4o", "https://custom.api/v1");
    expect(serviceWithEndpoint).toBeDefined();
  });

  test("applyDiffs with add-node", () => {
    const newNode: AutomationNode = {
      id: "n3",
      type: "logic.if",
      typeVersion: 1,
      name: "Condition",
      target: { kind: "local" },
      params: { condition: "true" },
      disabled: false,
      position: { x: 400, y: 0 },
    };

    const diffs: AiDiff[] = [
      { op: "add-node", path: "nodes", value: newNode, description: "Add condition node" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes.length).toBe(3);
    expect(result.nodes[2].id).toBe("n3");
    expect(result.edges.length).toBe(1);
    expect(result.settings).toEqual(BASE_DEFINITION.settings);
  });

  test("applyDiffs with remove-node", () => {
    const diffs: AiDiff[] = [
      { op: "remove-node", path: "n2", value: null, description: "Remove delay node" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].id).toBe("n1");
    expect(result.edges.length).toBe(0);
  });

  test("applyDiffs with update-node-params", () => {
    const diffs: AiDiff[] = [
      { op: "update-node-params", path: "n2", value: { delaySec: 10, newParam: "hello" }, description: "Update delay" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes.length).toBe(2);
    const updatedNode = result.nodes.find((n) => n.id === "n2");
    expect(updatedNode).toBeDefined();
    expect(updatedNode!.params.delaySec).toBe(10);
    expect(updatedNode!.params.newParam).toBe("hello");
    expect(result.edges).toEqual(BASE_DEFINITION.edges);
  });

  test("applyDiffs with add-edge", () => {
    const newNode: AutomationNode = {
      id: "n3",
      type: "logic.if",
      typeVersion: 1,
      name: "Condition",
      target: { kind: "local" },
      params: {},
      disabled: false,
      position: { x: 400, y: 0 },
    };
    const newEdge: AutomationEdge = {
      id: "e2",
      source: "n2",
      sourcePort: "out",
      target: "n3",
      targetPort: "in",
    };

    const diffs: AiDiff[] = [
      { op: "add-node", path: "nodes", value: newNode, description: "Add node" },
      { op: "add-edge", path: "edges", value: newEdge, description: "Add edge" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes.length).toBe(3);
    expect(result.edges.length).toBe(2);
    expect(result.edges[1].id).toBe("e2");
  });

  test("applyDiffs with remove-edge", () => {
    const diffs: AiDiff[] = [
      { op: "remove-edge", path: "e1", value: null, description: "Remove edge" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(0);
  });

  test("applyDiffs with update-settings", () => {
    const diffs: AiDiff[] = [
      { op: "update-settings", path: "settings", value: { runTimeoutSec: 7200 }, description: "Increase timeout" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.settings.runTimeoutSec).toBe(7200);
    expect(result.settings.savePayloads).toBe(true);
    expect(result.nodes).toEqual(BASE_DEFINITION.nodes);
  });

  test("applyDiffs with multiple diffs", () => {
    const newNode: AutomationNode = {
      id: "n3",
      type: "logic.if",
      typeVersion: 1,
      name: "Condition",
      target: { kind: "local" },
      params: {},
      disabled: false,
      position: { x: 400, y: 0 },
    };
    const newEdge: AutomationEdge = {
      id: "e2",
      source: "n2",
      sourcePort: "out",
      target: "n3",
      targetPort: "in",
    };

    const diffs: AiDiff[] = [
      { op: "add-node", path: "nodes", value: newNode, description: "Add node" },
      { op: "add-edge", path: "edges", value: newEdge, description: "Add edge" },
      { op: "update-node-params", path: "n1", value: { customParam: "value" }, description: "Update params" },
      { op: "update-settings", path: "settings", value: { runTimeoutSec: 600 }, description: "Change timeout" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes.length).toBe(3);
    expect(result.edges.length).toBe(2);
    const n1 = result.nodes.find((n) => n.id === "n1");
    expect(n1!.params.customParam).toBe("value");
    expect(result.settings.runTimeoutSec).toBe(600);
  });

  test("applyDiffs with invalid node ID returns unchanged definition", () => {
    const diffs: AiDiff[] = [
      { op: "update-node-params", path: "nonexistent", value: { foo: "bar" }, description: "Update bad node" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes).toEqual(BASE_DEFINITION.nodes);
    expect(result.edges).toEqual(BASE_DEFINITION.edges);
    expect(result.settings).toEqual(BASE_DEFINITION.settings);
  });

  test("applyDiffs does not mutate input", () => {
    const original = JSON.parse(JSON.stringify(BASE_DEFINITION));
    const newNode: AutomationNode = {
      id: "n3",
      type: "logic.if",
      typeVersion: 1,
      name: "Condition",
      target: { kind: "local" },
      params: {},
      disabled: false,
      position: { x: 400, y: 0 },
    };

    const diffs: AiDiff[] = [
      { op: "add-node", path: "nodes", value: newNode, description: "Add node" },
    ];

    AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(BASE_DEFINITION.nodes.length).toBe(2);
    expect(BASE_DEFINITION).toEqual(original);
  });

  test("applyDiffs with add-node missing id is skipped", () => {
    const badNode = { type: "logic.if", typeVersion: 1, name: "Bad" } as any;

    const diffs: AiDiff[] = [
      { op: "add-node", path: "nodes", value: badNode, description: "Add bad node" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.nodes.length).toBe(2);
  });

  test("applyDiffs with add-edge missing fields is skipped", () => {
    const badEdge = { id: "e2", source: "n2" } as any;

    const diffs: AiDiff[] = [
      { op: "add-edge", path: "edges", value: badEdge, description: "Add bad edge" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.edges.length).toBe(1);
  });

  test("applyDiffs with remove-edge nonexistent ID is skipped", () => {
    const diffs: AiDiff[] = [
      { op: "remove-edge", path: "nonexistent", value: null, description: "Remove bad edge" },
    ];

    const result = AiService.applyDiffs(BASE_DEFINITION, diffs);
    expect(result.edges.length).toBe(1);
  });
});
