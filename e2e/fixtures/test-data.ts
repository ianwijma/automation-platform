import type { AutomationDefinition, AutomationSettings, AutomationNode, AutomationEdge } from "../../src/core/types.js";
import type { Database } from "bun:sqlite";
import { createAutomation } from "../../src/api/automations.js";

const DEFAULT_SETTINGS: AutomationSettings = {
  runTimeoutSec: 3600,
  savePayloads: true,
  errorAutomationId: null,
};

function node(
  id: string,
  type: string,
  name: string,
  params: Record<string, unknown>,
  extra: Partial<AutomationNode> = {},
): AutomationNode {
  return {
    id,
    type,
    typeVersion: 1,
    name,
    target: { kind: "local" },
    params,
    disabled: false,
    position: { x: 0, y: 0 },
    ...extra,
  };
}

function edge(id: string, source: string, sourcePort: string, target: string, targetPort: string): AutomationEdge {
  return { id, source, sourcePort, target, targetPort };
}

export const SIMPLE_MANUAL_COMMAND: AutomationDefinition = {
  schemaVersion: 1,
  name: "Simple Manual Command",
  settings: DEFAULT_SETTINGS,
  nodes: [
    node("n1", "trigger.manual", "Start", {}),
    node("n2", "system.command", "Echo Hello", { command: "echo hello-from-test" }, { position: { x: 200, y: 0 } }),
  ],
  edges: [edge("e1", "n1", "out", "n2", "in")],
};

export const IF_ELSE_PIPELINE: AutomationDefinition = {
  schemaVersion: 1,
  name: "IF-Else Pipeline",
  settings: DEFAULT_SETTINGS,
  nodes: [
    node("n1", "trigger.manual", "Start", {}),
    node("n2", "system.command", "Get Data", { command: "echo success" }, { position: { x: 200, y: 0 } }),
    node("n3", "logic.if", "Check Result", { condition: "$json.exitCode === 0" }, { position: { x: 400, y: 0 } }),
    node("n4", "system.command", "On True", { command: "echo condition-true" }, { position: { x: 600, y: -100 } }),
    node("n5", "system.command", "On False", { command: "echo condition-false" }, { position: { x: 600, y: 100 } }),
  ],
  edges: [
    edge("e1", "n1", "out", "n2", "in"),
    edge("e2", "n2", "out", "n3", "in"),
    edge("e3", "n3", "true", "n4", "in"),
    edge("e4", "n3", "false", "n5", "in"),
  ],
};

export const ERROR_PIPELINE: AutomationDefinition = {
  schemaVersion: 1,
  name: "Error Pipeline",
  settings: DEFAULT_SETTINGS,
  nodes: [
    node("n1", "trigger.manual", "Start", {}),
    node("n2", "error.throw", "Fail", { message: "intentional test error" }, { position: { x: 200, y: 0 } }),
  ],
  edges: [edge("e1", "n1", "out", "n2", "in")],
};

export const STATE_PIPELINE: AutomationDefinition = {
  schemaVersion: 1,
  name: "State Pipeline",
  settings: DEFAULT_SETTINGS,
  nodes: [
    node("n1", "trigger.manual", "Start", {}),
    node("n2", "state.set", "Set Counter", { key: "counter", valueExpression: "42" }, { position: { x: 200, y: 0 } }),
    node("n3", "state.get", "Get Counter", { key: "counter" }, { position: { x: 400, y: 0 } }),
    node("n4", "system.command", "Echo Counter", { command: "echo state-retrieved" }, { position: { x: 600, y: 0 } }),
  ],
  edges: [
    edge("e1", "n1", "out", "n2", "in"),
    edge("e2", "n2", "out", "n3", "in"),
    edge("e3", "n3", "out", "n4", "in"),
  ],
};

export const WEBHOOK_PIPELINE: AutomationDefinition = {
  schemaVersion: 1,
  name: "Webhook Pipeline",
  settings: DEFAULT_SETTINGS,
  nodes: [
    node("n1", "trigger.webhook", "Webhook Trigger", { path: "incoming", method: "POST" }),
    node("n2", "system.command", "Process Webhook", { command: "echo webhook-received" }, { position: { x: 200, y: 0 } }),
  ],
  edges: [edge("e1", "n1", "out", "n2", "in")],
};

export const SCHEDULE_PIPELINE: AutomationDefinition = {
  schemaVersion: 1,
  name: "Schedule Pipeline",
  settings: DEFAULT_SETTINGS,
  nodes: [
    node("n1", "trigger.schedule", "Every Minute", { cron: "* * * * *", timezone: "UTC" }),
    node("n2", "system.command", "Scheduled Task", { command: "echo scheduled-task" }, { position: { x: 200, y: 0 } }),
  ],
  edges: [edge("e1", "n1", "out", "n2", "in")],
};

export const POLLING_PIPELINE: AutomationDefinition = {
  schemaVersion: 1,
  name: "Polling Pipeline",
  settings: DEFAULT_SETTINGS,
  nodes: [
    node("n1", "trigger.polling", "Poll Status", { intervalSec: 60, targetType: "command", target: "echo ok", stopAfter: 0 }),
    node("n2", "system.command", "Handle Change", { command: "echo change-detected" }, { position: { x: 200, y: 0 } }),
  ],
  edges: [edge("e1", "n1", "out", "n2", "in")],
};

const ALL_DEFINITIONS: AutomationDefinition[] = [
  SIMPLE_MANUAL_COMMAND,
  IF_ELSE_PIPELINE,
  ERROR_PIPELINE,
  STATE_PIPELINE,
  WEBHOOK_PIPELINE,
  SCHEDULE_PIPELINE,
  POLLING_PIPELINE,
];

export function seedTestData(db: Database): Record<string, string> {
  const idMap: Record<string, string> = {};

  for (const def of ALL_DEFINITIONS) {
    const result = createAutomation(db, def.name, def);
    idMap[def.name] = result.id;
  }

  return idMap;
}
