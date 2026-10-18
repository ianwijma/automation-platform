import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { Database } from "bun:sqlite";
import { createServer } from "./server.js";
import { AppDatabase, createDatabase } from "../db/database.js";
import type { AppConfig } from "../cli/config.js";
import "../nodes/index.js";

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
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('success','error','timeout','cancelled','interrupted','queued','running')),
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

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  name TEXT NOT NULL,
  created_run_id TEXT REFERENCES runs(id),
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  enc_blob TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS env_vars (
  scope TEXT NOT NULL CHECK(scope IN ('global','automation','machine')),
  scope_id TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope, scope_id, key)
);

CREATE TABLE IF NOT EXISTS state (
  automation_id TEXT NOT NULL REFERENCES automations(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(automation_id, key)
);

CREATE TABLE IF NOT EXISTS join_tokens (
  token_hash TEXT PRIMARY KEY,
  uses_left INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT (datetime('now'))
);
`;

const MOCK_UI_DIR = resolve("/tmp/ap-run-node-test-ui-" + Date.now());
const TEST_FILE_CONTENT = "<!DOCTYPE html><html><body>test</body></html>";

let server: ReturnType<typeof createServer> | null = null;
let baseUrl: string;
let tmpDataDir: string;

describe("run-node API", () => {
  beforeAll(() => {
    tmpDataDir = resolve("/tmp/ap-run-node-test-" + Date.now());
    mkdirSync(tmpDataDir, { recursive: true });
    mkdirSync(MOCK_UI_DIR, { recursive: true });
    writeFileSync(join(MOCK_UI_DIR, "index.html"), TEST_FILE_CONTENT);

    const db = createTestAppDb();
    const config: AppConfig = {
      mode: "standalone",
      port: 0,
      host: "127.0.0.1",
      dataDir: tmpDataDir,
      publicUrl: null,
      noBrowser: true,
      dbPath: ":memory:",
    };

    server = createServer({
      port: 0,
      host: "127.0.0.1",
      db,
      config,
      uiDist: MOCK_UI_DIR,
    });
    baseUrl = `http://127.0.0.1:${server.server.port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
      server = null;
    }
    if (existsSync(tmpDataDir))
      rmSync(tmpDataDir, { recursive: true, force: true });
    if (existsSync(MOCK_UI_DIR))
      rmSync(MOCK_UI_DIR, { recursive: true, force: true });
  });

  function createTestAppDb(): AppDatabase {
    return createDatabase(":memory:");
  }

  test("POST /api/automations/:id/run-node/:nodeId executes a single node", async () => {
    const def = {
      schemaVersion: 1,
      name: "Test",
      settings: {
        runTimeoutSec: 3600,
        savePayloads: true,
        errorAutomationId: null,
      },
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
          params: { command: "echo hello-from-node" },
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

    const createResp = await fetch(`${baseUrl}/api/automations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Run Node Test", definition: def }),
    });
    const { id } = (await createResp.json()) as any;

    const runResp = await fetch(
      `${baseUrl}/api/automations/${id}/run-node/n2`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(runResp.status).toBe(202);
    const run = (await runResp.json()) as any;
    expect(run.id).toBeDefined();
    expect(run.automationId).toBe(id);
    expect(run.mode).toBe("partial");
  });

  test("POST /api/automations/:id/run-node/:nodeId returns 404 for nonexistent node", async () => {
    const def = {
      schemaVersion: 1,
      name: "Test",
      settings: {
        runTimeoutSec: 3600,
        savePayloads: true,
        errorAutomationId: null,
      },
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

    const createResp = await fetch(`${baseUrl}/api/automations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Run Node 404 Node Test", definition: def }),
    });
    const { id } = (await createResp.json()) as any;

    const runResp = await fetch(
      `${baseUrl}/api/automations/${id}/run-node/nonexistent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(runResp.status).toBe(404);
  });

  test("POST /api/automations/:id/run-node/:nodeId returns 404 for nonexistent automation", async () => {
    const runResp = await fetch(
      `${baseUrl}/api/automations/nonexistent/run-node/n1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(runResp.status).toBe(404);
  });
});
