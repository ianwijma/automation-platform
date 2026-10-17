import { createHash } from "node:crypto";
const baseRevision = (db: Database, id: string) =>
  createHash("sha256")
    .update(
      (
        db.query("SELECT draft_json FROM automations WHERE id=?").get(id) as {
          draft_json: string;
        }
      ).draft_json,
    )
    .digest("hex");
import { getAiSettings, setAiSettings } from "../core/ai-settings.js";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { handleAiChat, handleAiApply, handleAiModels } from "./ai-routes.js";
import type { AiDiff } from "../core/api-types.js";
import { MockOpenRouter } from "../test-utils/mock-openrouter.js";

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
    settings: {
      runTimeoutSec: 3600,
      savePayloads: true,
      errorAutomationId: null,
    },
    nodes: [],
    edges: [],
  };
  const defJson = JSON.stringify(def);
  db.prepare(
    "INSERT INTO automations (id, name, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
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

  test("returns 400 for failed AI request", async () => {
    setAiSettings(db, {
      apiKey: "sk-fake-key",
      endpoint: "http://127.0.0.1:1",
    });

    const req = new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      }),
    });
    const res = await handleAiChat(db, req);
    expect(res.status).toBe(400);
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
        baseRevision: baseRevision(db, "auto-apply"),
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
        baseRevision: baseRevision(db, "auto-add"),
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

describe("handleAiModels", () => {
  let db: Database;
  let mockServer: MockOpenRouter;
  let mockUrl: string;

  beforeEach(async () => {
    db = createTestDb();
    mockServer = new MockOpenRouter();
    mockUrl = await mockServer.start();
  });

  afterAll(() => {
    mockServer?.stop();
  });

  test("returns 400 when no API key configured", async () => {
    const req = new Request("http://localhost/api/ai/models");
    const res = await handleAiModels(db, req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("API key not configured");
  });

  test("returns models from mock OpenRouter", async () => {
    setAiSettings(db, { apiKey: "sk-test-key" });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "ai_endpoint",
      mockUrl,
    );

    mockServer.setModelList([
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "meta/llama-3",
    ]);

    const req = new Request("http://localhost/api/ai/models");
    const res = await handleAiModels(db, req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.models).toBeDefined();
    expect(body.models.sort()).toEqual([
      "anthropic/claude-3.5-sonnet",
      "meta/llama-3",
      "openai/gpt-4o-mini",
    ]);
  });

  test("returns 500 when API fails", async () => {
    setAiSettings(db, { apiKey: "sk-fail-key" });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "ai_endpoint",
      mockUrl,
    );

    mockServer.setFailure(500);

    const req = new Request("http://localhost/api/ai/models");
    const res = await handleAiModels(db, req);
    expect(res.status).toBe(500);
    const body = (await res.json()) as any;
    expect(body.error).toBeDefined();
  });
});
