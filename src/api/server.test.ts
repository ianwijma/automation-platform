import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { Database } from "bun:sqlite";
import { createServer } from "./server.js";
import { AppDatabase, createDatabase } from "../db/database.js";
import type { AppConfig } from "../cli/config.js";

const MOCK_UI_DIR = resolve("/tmp/ap-server-test-ui-" + Date.now());
const TEST_FILE_CONTENT = "<!DOCTYPE html><html><body>test</body></html>";

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

function createTestAppDb(): AppDatabase {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return new AppDatabase(db);
}

let server: ReturnType<typeof createServer> | null = null;
let baseUrl: string;
let tmpDataDir: string;

describe("HTTP server", () => {
  beforeAll(() => {
    tmpDataDir = resolve("/tmp/ap-server-test-" + Date.now());
    mkdirSync(tmpDataDir, { recursive: true });

    mkdirSync(MOCK_UI_DIR, { recursive: true });
    writeFileSync(join(MOCK_UI_DIR, "index.html"), TEST_FILE_CONTENT);
    writeFileSync(join(MOCK_UI_DIR, "test.txt"), "hello world");

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

    server = createServer({ port: 0, host: "127.0.0.1", db, config, uiDist: MOCK_UI_DIR });
    baseUrl = `http://127.0.0.1:${server.server.port}`;
  });

  afterAll(() => {
    if (server) {
      server.close();
      server = null;
    }
    if (existsSync(tmpDataDir)) {
      rmSync(tmpDataDir, { recursive: true, force: true });
    }
    if (existsSync(MOCK_UI_DIR)) {
      rmSync(MOCK_UI_DIR, { recursive: true, force: true });
    }
  });

  test("serves static index.html", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("test");
  });

  test("serves static text file with correct content type", async () => {
    const res = await fetch(`${baseUrl}/test.txt`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type");
    expect(ct).toContain("text/plain");
  });

  test("path traversal protection — request for /../../../etc/passwd is safe", async () => {
    const { default: http } = await import("node:http");
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.get(
        `http://127.0.0.1:${server!.server.port}/../../../etc/passwd`,
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 200, body }));
        },
      );
      req.on("error", reject);
    });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toContain("test");
    }
  });

  test("CORS headers on API responses", async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBeDefined();
    expect(res.headers.get("access-control-allow-headers")).toBeDefined();
  });

  test("OPTIONS preflight returns 204", async () => {
    const res = await fetch(`${baseUrl}/api/automations`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("/api/system/info returns version and uptime", async () => {
    const res = await fetch(`${baseUrl}/api/system/info`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.mode).toBe("standalone");
  });

  test("unknown /api/ route returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  test("CORS headers on 404 responses", async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("non-GET non-API returns 404", async () => {
    const res = await fetch(`${baseUrl}/some-page`, { method: "POST" });
    expect(res.status).toBe(404);
  });
});
