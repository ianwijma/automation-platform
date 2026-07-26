import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { registerWebhook, handleWebhookRequest, clearTestWebhooks } from "./webhooks.js";

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

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_local INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT DEFAULT '[]',
  capabilities_json TEXT DEFAULT '{}',
  version TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen_at TEXT,
  enrolled_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id),
  version_id TEXT REFERENCES automation_versions(id),
  mode TEXT NOT NULL CHECK(mode IN ('manual','trigger','dry','partial')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','success','error','interrupted','cancelled')),
  trigger_json TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS node_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  node_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'queued',
  attempt INTEGER NOT NULL DEFAULT 0,
  simulated INTEGER NOT NULL DEFAULT 0,
  input_json TEXT,
  input_artifact TEXT,
  output_json TEXT,
  output_artifact TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  duration_ms INTEGER,
  error_json TEXT
);
`;

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return db;
}

function insertActiveAutomation(db: Database, id: string) {
  const now = new Date().toISOString();
  const def = {
    schemaVersion: 1,
    name: "Test",
    settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
    nodes: [],
    edges: [],
  };
  const defJson = JSON.stringify(def);
  const versionId = "v-" + id;
  db.prepare(
    "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "Test Auto", versionId, defJson, JSON.stringify(def.settings), now, now);
  db.prepare(
    "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(versionId, id, 1, defJson, now);
}

describe("registerWebhook", () => {
  beforeEach(() => {
    clearTestWebhooks();
  });

  test("registers a test webhook entry", () => {
    registerWebhook("auto-1", "test-path");
    const db = createTestDb();
    const dispatcher = new AgentDispatcher();
    const req = new Request("http://localhost/api/webhook/auto-1/test-path", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ test: true }),
    });
    return handleWebhookRequest(db, dispatcher, "auto-1", "test-path", req, "test").then((res) => {
      expect(res.status).not.toBe(404);
    });
  });
});

describe("handleWebhookRequest", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    db = createTestDb();
    dispatcher = new AgentDispatcher();
    clearTestWebhooks();
    insertActiveAutomation(db, "auto-1");
  });

  test("test mode: returns 404 for unregistered webhook", async () => {
    const req = new Request("http://localhost/api/webhook/auto-1/unknown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleWebhookRequest(db, dispatcher, "auto-1", "unknown", req, "test");
    expect(res.status).toBe(404);
  });

  test("test mode: returns 410 for expired webhook", async () => {
    registerWebhook("auto-1", "expired-path");
    const origNow = Date.now;
    Date.now = () => origNow() + 3 * 60 * 1000;
    try {
      const req = new Request("http://localhost/api/webhook/auto-1/expired-path", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await handleWebhookRequest(db, dispatcher, "auto-1", "expired-path", req, "test");
      expect(res.status).toBe(410);
    } finally {
      Date.now = origNow;
    }
  });

  test("test mode: registered webhook triggers run", async () => {
    registerWebhook("auto-1", "test-path");
    const req = new Request("http://localhost/api/webhook/auto-1/test-path", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "push" }),
    });
    const res = await handleWebhookRequest(db, dispatcher, "auto-1", "test-path", req, "test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBeDefined();
    expect(body.status).toBe("triggered");
  });

  test("prod mode: returns 404 for non-existent automation", async () => {
    const req = new Request("http://localhost/api/webhook/no-auto/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleWebhookRequest(db, dispatcher, "no-auto", "x", req, "prod");
    expect(res.status).toBe(404);
  });

  test("prod mode: triggers run for active automation", async () => {
    const req = new Request("http://localhost/api/webhook/auto-1/prod-path", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "deploy" }),
    });
    const res = await handleWebhookRequest(db, dispatcher, "auto-1", "prod-path", req, "prod");
    expect(res.status).toBe(200);
  });

  test("prod mode: returns 404 for automation without active version", async () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO automations (id, name, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("inactive-auto", "Inactive", null, null, now, now);

    const req = new Request("http://localhost/api/webhook/inactive-auto/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handleWebhookRequest(db, dispatcher, "inactive-auto", "x", req, "prod");
    expect(res.status).toBe(404);
  });
});
