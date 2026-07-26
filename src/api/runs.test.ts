import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { runAutomation, getRun, listRuns } from "./runs.js";

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

function insertAutomation(db: Database, id: string, name: string, definition: any, versionId?: string) {
  const now = new Date().toISOString();
  const defJson = JSON.stringify(definition);
  const vid = versionId ?? "v-" + id;
  db.prepare(
    "INSERT INTO automations (id, name, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, name, defJson, JSON.stringify(definition.settings), now, now);
  db.prepare(
    "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(vid, id, 1, defJson, now);
}

function makeDefinition() {
  return {
    schemaVersion: 1 as const,
    name: "Test Automation",
    settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
    nodes: [],
    edges: [],
  };
}

describe("runAutomation", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    db = createTestDb();
    dispatcher = new AgentDispatcher();
  });

  test("returns null for non-existent automation", async () => {
    const result = await runAutomation(db, dispatcher, "no-such-id", { mode: "manual" });
    expect(result).toBeNull();
  });

  test("returns null for automation without definition", async () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO automations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)"
    ).run("empty-auto", "Empty", now, now);
    const result = await runAutomation(db, dispatcher, "empty-auto", { mode: "manual" });
    expect(result).toBeNull();
  });

  test("runs automation with valid definition", async () => {
    const def = makeDefinition();
    insertAutomation(db, "auto-1", "Test Auto", def);
    const result = await runAutomation(db, dispatcher, "auto-1", { mode: "manual" });
    expect(result).not.toBeNull();
    expect(result!.automationId).toBe("auto-1");
    expect(result!.status).toBe("success");
    expect(result!.mode).toBe("manual");
  });

  test("uses active version definition when available", async () => {
    const def = makeDefinition();
    const versionId = "v-active";
    const now = new Date().toISOString();
    const defJson = JSON.stringify(def);
    db.prepare(
      "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("auto-2", "Active Auto", versionId, defJson, JSON.stringify(def.settings), now, now);
    db.prepare(
      "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(versionId, "auto-2", 1, defJson, now);
    const result = await runAutomation(db, dispatcher, "auto-2", { mode: "manual" });
    expect(result).not.toBeNull();
    expect(result!.versionId).toBe(versionId);
  });
});

describe("getRun", () => {
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    dispatcher = new AgentDispatcher();
  });

  test("returns null for non-existent run", () => {
    expect(getRun(dispatcher, "no-run")).toBeNull();
  });

  test("returns run with nodeExecutions for existing run", async () => {
    const db = createTestDb();
    const def = makeDefinition();
    insertAutomation(db, "auto-1", "Test", def);
    const run = await runAutomation(db, dispatcher, "auto-1", { mode: "manual" });
    const got = getRun(dispatcher, run!.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(run!.id);
    expect(got!.nodeExecutions).toBeInstanceOf(Array);
  });
});

describe("listRuns", () => {
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    dispatcher = new AgentDispatcher();
  });

  test("returns empty array when no runs", () => {
    expect(listRuns(dispatcher)).toEqual([]);
  });

  test("returns all runs without filter", async () => {
    const db = createTestDb();
    const def = makeDefinition();
    insertAutomation(db, "auto-1", "Test", def);
    await runAutomation(db, dispatcher, "auto-1", { mode: "manual" });
    await runAutomation(db, dispatcher, "auto-1", { mode: "trigger", triggerData: [] });
    const all = listRuns(dispatcher);
    expect(all.length).toBe(2);
  });

  test("filters by automationId", async () => {
    const db = createTestDb();
    const def = makeDefinition();
    insertAutomation(db, "auto-1", "Test 1", def);
    insertAutomation(db, "auto-2", "Test 2", def);
    await runAutomation(db, dispatcher, "auto-1", { mode: "manual" });
    await runAutomation(db, dispatcher, "auto-2", { mode: "manual" });
    const filtered = listRuns(dispatcher, "auto-1");
    expect(filtered.length).toBe(1);
    expect(filtered[0].automationId).toBe("auto-1");
  });
});
