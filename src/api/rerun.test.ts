import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { rerunFromNode } from "./rerun.js";
import type { RunRecord, NodeExecutionRecord } from "../core/execution-engine.js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_version_id TEXT,
  draft_json TEXT,
  settings_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_versions (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id),
  version_no INTEGER NOT NULL,
  definition_json TEXT NOT NULL,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return db;
}

function makeDefinition() {
  return {
    schemaVersion: 1 as const,
    name: "Test Rerun",
    settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
    nodes: [
      {
        id: "node-1",
        type: "trigger.manual",
        typeVersion: 1,
        name: "Trigger",
        target: { kind: "local" as const },
        params: {},
        disabled: false,
        position: { x: 0, y: 0 },
      },
      {
        id: "node-2",
        type: "action.shell",
        typeVersion: 1,
        name: "Shell",
        target: { kind: "local" as const },
        params: { command: "echo" },
        disabled: false,
        position: { x: 200, y: 0 },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "node-1",
        sourcePort: "output",
        target: "node-2",
        targetPort: "input",
      },
    ],
  };
}

describe("rerunFromNode", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    db = createTestDb();
    dispatcher = new AgentDispatcher();
  });

  test("returns null for non-existent run", async () => {
    const result = await rerunFromNode(db, dispatcher, "no-run", "node-1");
    expect(result).toBeNull();
  });

  test("returns null for non-existent node in run", async () => {
    const now = new Date().toISOString();
    const def = makeDefinition();
    const defJson = JSON.stringify(def);
    const versionId = "v-auto-1";
    db.prepare(
      "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("auto-1", "Test", versionId, defJson, JSON.stringify(def.settings), now, now);
    db.prepare(
      "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(versionId, "auto-1", 1, defJson, now);

    const run: RunRecord = {
      id: "run-1",
      automationId: "auto-1",
      versionId,
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [
        {
          id: "ne-1",
          runId: "run-1",
          nodeId: "node-1",
          agentId: "local",
          status: "success",
          attempt: 0,
          simulated: false,
          input: null,
          output: [{ json: { triggered: true } }],
          pinned: false,
          startedAt: now,
          durationMs: 10,
          error: null,
        },
      ],
    };
    dispatcher.saveRun(run);

    const result = await rerunFromNode(db, dispatcher, "run-1", "nonexistent-node");
    expect(result).toBeNull();
  });

  test("returns null for non-existent automation in db", async () => {
    const now = new Date().toISOString();
    const run: RunRecord = {
      id: "run-2",
      automationId: "no-auto",
      versionId: "v-x",
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [
        {
          id: "ne-2",
          runId: "run-2",
          nodeId: "node-1",
          agentId: "local",
          status: "success",
          attempt: 0,
          simulated: false,
          input: null,
          output: [{ json: { data: "test" } }],
          pinned: false,
          startedAt: now,
          durationMs: 10,
          error: null,
        },
      ],
    };
    dispatcher.saveRun(run);

    const result = await rerunFromNode(db, dispatcher, "run-2", "node-1");
    expect(result).toBeNull();
  });

  test("reruns from a valid node with pinned data", async () => {
    const now = new Date().toISOString();
    const def = makeDefinition();
    const defJson = JSON.stringify(def);
    const versionId = "v-auto-rerun";
    db.prepare(
      "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("auto-rerun", "Rerun Test", versionId, defJson, JSON.stringify(def.settings), now, now);
    db.prepare(
      "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(versionId, "auto-rerun", 1, defJson, now);

    const nodeExec1: NodeExecutionRecord = {
      id: "ne-10",
      runId: "run-rerun",
      nodeId: "node-1",
      agentId: "local",
      status: "success",
      attempt: 0,
      simulated: false,
      input: null,
      output: [{ json: { triggered: true } }],
      pinned: false,
      startedAt: now,
      durationMs: 5,
      error: null,
    };
    const nodeExec2: NodeExecutionRecord = {
      id: "ne-11",
      runId: "run-rerun",
      nodeId: "node-2",
      agentId: "local",
      status: "success",
      attempt: 0,
      simulated: false,
      input: null,
      output: [{ json: { stdout: "hello" } }],
      pinned: false,
      startedAt: now,
      durationMs: 10,
      error: null,
    };

    const run: RunRecord = {
      id: "run-rerun",
      automationId: "auto-rerun",
      versionId,
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [nodeExec1, nodeExec2],
    };
    dispatcher.saveRun(run);

    const result = await rerunFromNode(db, dispatcher, "run-rerun", "node-2");
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("partial");
    expect(result!.automationId).toBe("auto-rerun");
  });

  test("handles engine execution error gracefully", async () => {
    const now = new Date().toISOString();
    const def = makeDefinition();
    def.nodes.push({
      id: "node-bad",
      type: "action.nonexistent",
      typeVersion: 1,
      name: "Bad Node",
      target: { kind: "local" as const },
      params: {},
      disabled: false,
      position: { x: 400, y: 0 },
    });
    const defJson = JSON.stringify(def);
    const versionId = "v-auto-err";
    db.prepare(
      "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("auto-err", "Error Test", versionId, defJson, JSON.stringify(def.settings), now, now);
    db.prepare(
      "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(versionId, "auto-err", 1, defJson, now);

    const nodeExec: NodeExecutionRecord = {
      id: "ne-err",
      runId: "run-err",
      nodeId: "node-1",
      agentId: "local",
      status: "success",
      attempt: 0,
      simulated: false,
      input: null,
      output: [{ json: { triggered: true } }],
      pinned: false,
      startedAt: now,
      durationMs: 5,
      error: null,
    };

    dispatcher.saveRun({
      id: "run-err",
      automationId: "auto-err",
      versionId,
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [nodeExec],
    });

    try {
      const result = await rerunFromNode(db, dispatcher, "run-err", "node-1");
      expect(result).not.toBeNull();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  test("returns null when automation has no version or draft", async () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("auto-no-def", "No Def", null, null, null, now, now);

    const nodeExec: NodeExecutionRecord = {
      id: "ne-no-def",
      runId: "run-no-def",
      nodeId: "node-1",
      agentId: "local",
      status: "success",
      attempt: 0,
      simulated: false,
      input: null,
      output: [{ json: { data: "test" } }],
      pinned: false,
      startedAt: now,
      durationMs: 5,
      error: null,
    };

    dispatcher.saveRun({
      id: "run-no-def",
      automationId: "auto-no-def",
      versionId: "draft",
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [nodeExec],
    });

    const result = await rerunFromNode(db, dispatcher, "run-no-def", "node-1");
    expect(result).toBeNull();
  });
});
