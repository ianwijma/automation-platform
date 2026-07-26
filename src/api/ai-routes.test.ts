import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleAiChat, handleAiApply } from "./ai-routes.js";
import type { AiDiff } from "../core/api-types.js";

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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return db;
}

function insertAutomation(db: Database, id: string) {
  const now = new Date().toISOString();
  const def = {
    schemaVersion: 1,
    name: "Test",
    settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
    nodes: [],
    edges: [],
  };
  const defJson = JSON.stringify(def);
  db.prepare(
    "INSERT INTO automations (id, name, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, "Test", defJson, JSON.stringify(def.settings), now, now);
}

describe("handleAiChat", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("returns 400 when no API key configured", async () => {
    const req = new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    });
    const res = await handleAiChat(db, req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("API key not configured");
  });

  test("returns 500 for messages without API connectivity", async () => {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("ai_api_key", "sk-fake-key");

    const req = new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    });
    const res = await handleAiChat(db, req);
    expect(res.status).toBe(500);
  });
});

describe("handleAiApply", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("returns 404 for non-existent automation", async () => {
    const req = new Request("http://localhost/api/ai/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        automationId: "no-auto",
        diffs: [],
      }),
    });
    const res = await handleAiApply(db, req);
    expect(res.status).toBe(404);
  });

  test("applies diffs to existing automation", async () => {
    insertAutomation(db, "auto-apply");

    const diffs: AiDiff[] = [
      {
        op: "update-settings",
        path: "settings",
        value: { runTimeoutSec: 7200 },
        description: "Increase timeout",
      },
    ];

    const req = new Request("http://localhost/api/ai/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        automationId: "auto-apply",
        diffs,
      }),
    });

    const res = await handleAiApply(db, req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automationId).toBe("auto-apply");
    expect(body.definition.settings.runTimeoutSec).toBe(7200);
  });

  test("applies add-node diff", async () => {
    insertAutomation(db, "auto-add");

    const diffs: AiDiff[] = [
      {
        op: "add-node",
        path: "nodes",
        value: {
          id: "new-node",
          type: "trigger.manual",
          typeVersion: 1,
          name: "New Trigger",
          target: { kind: "local" },
          params: {},
          disabled: false,
          position: { x: 300, y: 100 },
        },
        description: "Add a manual trigger",
      },
    ];

    const req = new Request("http://localhost/api/ai/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        automationId: "auto-add",
        diffs,
      }),
    });

    const res = await handleAiApply(db, req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.definition.nodes.length).toBe(1);
    expect(body.definition.nodes[0].id).toBe("new-node");
  });
});
