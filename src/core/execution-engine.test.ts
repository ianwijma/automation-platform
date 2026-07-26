import { describe, test, expect, beforeAll } from "bun:test";
import { ExecutionEngine } from "./execution-engine.js";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { nodeRegistry } from "./node-registry.js";
import "../nodes/index.js";
import type { AutomationDefinition } from "./types.js";

const SIMPLE_AUTOMATION: AutomationDefinition = {
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
      type: "system.command",
      typeVersion: 1,
      name: "Echo",
      target: { kind: "local" },
      params: { command: "echo hello" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
    {
      id: "n3",
      type: "logic.if",
      typeVersion: 1,
      name: "Check",
      target: { kind: "local" },
      params: { condition: "$json.stdout === 'hello\\n'" },
      disabled: false,
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    { id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" },
    { id: "e2", source: "n2", sourcePort: "out", target: "n3", targetPort: "in" },
  ],
};

const STATE_AUTOMATION: AutomationDefinition = {
  schemaVersion: 1,
  name: "State Test",
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
      type: "state.set",
      typeVersion: 1,
      name: "Set Counter",
      target: { kind: "local" },
      params: { key: "counter", valueExpression: "42" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
    {
      id: "n3",
      type: "state.get",
      typeVersion: 1,
      name: "Get Counter",
      target: { kind: "local" },
      params: { key: "counter" },
      disabled: false,
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    { id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" },
    { id: "e2", source: "n2", sourcePort: "out", target: "n3", targetPort: "in" },
  ],
};

describe("Execution Engine - Local", () => {
  let engine: ExecutionEngine;
  let dispatcher: AgentDispatcher;

  beforeAll(() => {
    dispatcher = new AgentDispatcher();
    engine = new ExecutionEngine(dispatcher);
  });

  test("nodes are registered", () => {
    expect(nodeRegistry.lookup("trigger.manual")).toBeDefined();
    expect(nodeRegistry.lookup("system.command")).toBeDefined();
    expect(nodeRegistry.lookup("logic.if")).toBeDefined();
    expect(nodeRegistry.lookup("state.get")).toBeDefined();
    expect(nodeRegistry.lookup("state.set")).toBeDefined();
  });

  test("manual trigger → command → if runs successfully", async () => {
    const run = await engine.execute(SIMPLE_AUTOMATION, "test-auto-1", "v1", {
      mode: "manual",
    });

    expect(run.status).toBe("success");
    expect(run.nodeExecutions.length).toBe(3);

    const triggerExec = run.nodeExecutions.find((n) => n.nodeId === "n1");
    const commandExec = run.nodeExecutions.find((n) => n.nodeId === "n2");
    const ifExec = run.nodeExecutions.find((n) => n.nodeId === "n3");

    expect(triggerExec?.status).toBe("success");
    expect(commandExec?.status).toBe("success");
    expect(ifExec?.status).toBe("success");

    expect(commandExec?.output).toBeDefined();
    expect(commandExec?.output?.[0]?.json?.stdout).toBe("hello\n");
    expect(commandExec?.output?.[0]?.json?.exitCode).toBe(0);

    expect(ifExec?.output).toBeDefined();
    expect(ifExec?.output?.[0]?.json?._branch).toBe("true");
  });

  test("state.get/set works in a run", async () => {
    const run = await engine.execute(STATE_AUTOMATION, "test-auto-2", "v1", {
      mode: "manual",
    });

    expect(run.status).toBe("success");
    expect(run.nodeExecutions.length).toBe(3);

    const stateGetExec = run.nodeExecutions.find((n) => n.nodeId === "n3");
    expect(stateGetExec?.status).toBe("success");
    expect(stateGetExec?.output?.[0]?.json?.state_counter).toBe(42);
  });

  test("dry-run simulates side-effecting nodes", async () => {
    const run = await engine.execute(SIMPLE_AUTOMATION, "test-auto-3", "v1", {
      mode: "dry",
      dryRun: true,
    });

    expect(run.status).toBe("success");

    const commandExec = run.nodeExecutions.find((n) => n.nodeId === "n2");
    expect(commandExec?.simulated).toBe(true);
    expect(commandExec?.output).toBeDefined();
  });

  test("disabled nodes are skipped", async () => {
    const disabledAutomation: AutomationDefinition = {
      ...SIMPLE_AUTOMATION,
      nodes: SIMPLE_AUTOMATION.nodes.map((n) =>
        n.id === "n2" ? { ...n, disabled: true } : n,
      ),
    };

    const run = await engine.execute(disabledAutomation, "test-auto-4", "v1", {
      mode: "manual",
    });

    expect(run.status).toBe("success");
    const commandExec = run.nodeExecutions.find((n) => n.nodeId === "n2");
    expect(commandExec).toBeUndefined();
  });

  test("pin data substitutes for node execution", async () => {
    const pinnedItems = [{ json: { stdout: "pinned\n", exitCode: 0 } }];
    const run = await engine.execute(SIMPLE_AUTOMATION, "test-auto-5", "v1", {
      mode: "manual",
      pinData: { n2: pinnedItems },
    });

    expect(run.status).toBe("success");
    const commandExec = run.nodeExecutions.find((n) => n.nodeId === "n2");
    expect(commandExec?.pinned).toBe(true);
    expect(commandExec?.output?.[0]?.json?.stdout).toBe("pinned\n");
  });
});
