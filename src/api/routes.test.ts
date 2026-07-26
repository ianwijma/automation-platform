import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { matchRoute, handleApiRoute } from "./routes.js";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { AppDatabase } from "../db/database.js";
import { CredentialVault } from "../core/credential-vault.js";
import { EnvResolver } from "../core/env-resolver.js";
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

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return db;
}

function makeDefinition() {
  return {
    schemaVersion: 1 as const,
    name: "Test Auto",
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
    ],
    edges: [],
  };
}

function insertAutomation(db: Database, id: string, name = "Test") {
  const now = new Date().toISOString();
  const def = makeDefinition();
  const defJson = JSON.stringify(def);
  const versionId = `v-${id}`;
  db.prepare(
    "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, name, versionId, defJson, JSON.stringify(def.settings), now, now);
  db.prepare(
    "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(versionId, id, 1, defJson, now);
  return versionId;
}

function buildRouteContext(overrides?: { vault?: CredentialVault; envResolver?: EnvResolver }) {
  const db = createTestDb();
  const appDb = new AppDatabase(db);
  const dispatcher = new AgentDispatcher(overrides?.vault, overrides?.envResolver);
  return { db, appDb, dispatcher };
}

function makeUrl(path: string, base = "http://localhost") {
  return `${base}${path}`;
}

function makeRequest(method: string, path: string, body?: unknown): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(makeUrl(path), init);
}

async function extractCorsHeaders(res: Response): Promise<Record<string, string>> {
  const cors: Record<string, string> = {};
  const expectedKeys = [
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "access-control-max-age",
  ];
  for (const key of expectedKeys) {
    const val = res.headers.get(key);
    if (val) cors[key] = val;
  }
  return cors;
}

describe("matchRoute", () => {
  test("exact match returns empty params", () => {
    const result = matchRoute("/api/automations", "/api/automations");
    expect(result).toEqual({});
  });

  test("parameterized match returns extracted params", () => {
    const result = matchRoute("/api/automations/abc-123", "/api/automations/:id");
    expect(result).toEqual({ id: "abc-123" });
  });

  test("multiple parameters are extracted", () => {
    const result = matchRoute("/api/runs/run-1/rerun-from/node-2", "/api/runs/:id/rerun-from/:nodeId");
    expect(result).toEqual({ id: "run-1", nodeId: "node-2" });
  });

  test("no match returns null", () => {
    const result = matchRoute("/api/unknown", "/api/automations");
    expect(result).toBeNull();
  });

  test("different number of segments returns null", () => {
    const result = matchRoute("/api/automations", "/api/automations/:id");
    expect(result).toBeNull();
  });

  test("segment mismatch returns null", () => {
    const result = matchRoute("/api/runs/abc", "/api/automations/:id");
    expect(result).toBeNull();
  });
});

describe("handleApiRoute", () => {
  test("unknown route returns null", () => {
    const { db, dispatcher } = buildRouteContext();
    const req = makeRequest("GET", "/api/nonexistent");
    const result = handleApiRoute(db, dispatcher, req);
    expect(result).toBeNull();
  });

  test("known route matches and returns response", async () => {
    const { db, dispatcher } = buildRouteContext();
    insertAutomation(db, "auto-1");
    const req = makeRequest("GET", "/api/automations");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json() as any[];
    expect(body).toHaveLength(1);
  });

  test("CORS headers present on all responses", async () => {
    const { db, dispatcher } = buildRouteContext();
    insertAutomation(db, "auto-cors");
    const req = makeRequest("GET", "/api/automations");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res).not.toBeNull();
    const cors = await extractCorsHeaders(res!);
    expect(cors["access-control-allow-origin"]).toBe("*");
    expect(cors["access-control-allow-methods"]).toBeDefined();
    expect(cors["access-control-allow-headers"]).toBeDefined();
    expect(cors["access-control-max-age"]).toBeDefined();
  });
});

describe("Route handlers — automations", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    const ctx = buildRouteContext();
    db = ctx.db;
    dispatcher = ctx.dispatcher;
  });

  test("GET /api/automations — list", async () => {
    insertAutomation(db, "auto-list-1");
    insertAutomation(db, "auto-list-2");
    const req = makeRequest("GET", "/api/automations");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any[];
    expect(body).toHaveLength(2);
  });

  test("POST /api/automations — create", async () => {
    const def = makeDefinition();
    const req = makeRequest("POST", "/api/automations", { name: "New Auto", definition: def });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(201);
    const body = await res!.json() as any;
    expect(body.name).toBe("New Auto");
    expect(body.id).toBeDefined();
  });

  test("POST /api/automations — missing fields returns 400", async () => {
    const req = makeRequest("POST", "/api/automations", { name: "No Def" });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(400);
  });

  test("POST /api/automations — invalid JSON returns 400", async () => {
    const req = new Request(makeUrl("/api/automations"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(400);
  });

  test("GET /api/automations/:id — get", async () => {
    insertAutomation(db, "auto-get");
    const req = makeRequest("GET", "/api/automations/auto-get");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.id).toBe("auto-get");
  });

  test("GET /api/automations/:id — not found returns 404", async () => {
    const req = makeRequest("GET", "/api/automations/no-such");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(404);
  });

  test("PUT /api/automations/:id — update", async () => {
    insertAutomation(db, "auto-update");
    const def = makeDefinition();
    def.settings.runTimeoutSec = 7200;
    const req = makeRequest("PUT", "/api/automations/auto-update", { definition: def });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.id).toBe("auto-update");
  });

  test("PUT /api/automations/:id — not found returns 404", async () => {
    const def = makeDefinition();
    const req = makeRequest("PUT", "/api/automations/no-such", { definition: def });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(404);
  });

  test("PUT /api/automations/:id — missing definition returns 400", async () => {
    insertAutomation(db, "auto-update2");
    const req = makeRequest("PUT", "/api/automations/auto-update2", {});
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(400);
  });

  test("DELETE /api/automations/:id — delete", async () => {
    insertAutomation(db, "auto-del");
    const req = makeRequest("DELETE", "/api/automations/auto-del");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.success).toBe(true);
  });

  test("DELETE /api/automations/:id — not found returns 404", async () => {
    const req = makeRequest("DELETE", "/api/automations/no-such");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(404);
  });

  test("POST /api/automations/:id/activate — activate", async () => {
    insertAutomation(db, "auto-act");
    const req = makeRequest("POST", "/api/automations/auto-act/activate");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.activeVersionId).toBeDefined();
  });

  test("POST /api/automations/:id/deactivate — deactivate", async () => {
    const versionId = insertAutomation(db, "auto-deact");
    db.prepare("UPDATE automations SET active_version_id = ? WHERE id = ?").run(versionId, "auto-deact");
    const req = makeRequest("POST", "/api/automations/auto-deact/deactivate");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.activeVersionId).toBeNull();
  });
});

describe("Route handlers — runs", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    const ctx = buildRouteContext();
    db = ctx.db;
    dispatcher = ctx.dispatcher;
  });

  test("POST /api/automations/:id/run — run automation", async () => {
    insertAutomation(db, "auto-run");
    const req = makeRequest("POST", "/api/automations/auto-run/run", { mode: "manual" });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res).not.toBeNull();
    expect([200, 201]).toContain(res!.status);
  });

  test("POST /api/automations/:id/run — not found returns 404", async () => {
    const req = makeRequest("POST", "/api/automations/no-such/run", { mode: "manual" });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(404);
  });

  test("POST /api/automations/:id/run — empty body is ok", async () => {
    insertAutomation(db, "auto-run2");
    const req = new Request(makeUrl("/api/automations/auto-run2/run"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "",
    });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res).not.toBeNull();
  });

  test("GET /api/runs — list", async () => {
    const now = new Date().toISOString();
    const run: RunRecord = {
      id: "run-list-1",
      automationId: "auto-1",
      versionId: "v-1",
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [],
    };
    dispatcher.saveRun(run);
    const req = makeRequest("GET", "/api/runs");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any[];
    expect(body).toHaveLength(1);
  });

  test("GET /api/runs — filter by automationId", async () => {
    const now = new Date().toISOString();
    dispatcher.saveRun({
      id: "run-f1",
      automationId: "auto-a",
      versionId: "v-1",
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [],
    });
    dispatcher.saveRun({
      id: "run-f2",
      automationId: "auto-b",
      versionId: "v-2",
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [],
    });
    const req = makeRequest("GET", "/api/runs?automationId=auto-a");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any[];
    expect(body).toHaveLength(1);
    expect(body[0].automationId).toBe("auto-a");
  });

  test("GET /api/runs/:id — get", async () => {
    const now = new Date().toISOString();
    dispatcher.saveRun({
      id: "run-get-1",
      automationId: "auto-1",
      versionId: "v-1",
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [],
    });
    const req = makeRequest("GET", "/api/runs/run-get-1");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.id).toBe("run-get-1");
  });

  test("GET /api/runs/:id — not found returns 404", async () => {
    const req = makeRequest("GET", "/api/runs/no-such");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(404);
  });

  test("POST /api/runs/:id/rerun-from/:nodeId — rerun", async () => {
    const now = new Date().toISOString();
    const versionId = insertAutomation(db, "auto-rerun");
    const nodeExec: NodeExecutionRecord = {
      id: "ne-r1",
      runId: "run-rerun-1",
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
    };
    dispatcher.saveRun({
      id: "run-rerun-1",
      automationId: "auto-rerun",
      versionId,
      mode: "manual",
      status: "success",
      startedAt: now,
      finishedAt: now,
      error: null,
      nodeExecutions: [nodeExec],
    });
    const req = makeRequest("POST", "/api/runs/run-rerun-1/rerun-from/node-1");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res).not.toBeNull();
    expect([200, 201]).toContain(res!.status);
  });

  test("POST /api/runs/:id/cancel — returns 501", async () => {
    const req = makeRequest("POST", "/api/runs/run-cancel/cancel");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(501);
  });
});

describe("Route handlers — credentials", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;
  let appDb: AppDatabase;
  let vault: CredentialVault;

  beforeEach(() => {
    db = createTestDb();
    appDb = new AppDatabase(db);
    vault = new CredentialVault(appDb);
    dispatcher = new AgentDispatcher(vault);
  });

  test("GET /api/credentials — list (with vault)", async () => {
    vault.storeCredential("My Cred", "oauth2", { token: "abc" });
    const req = makeRequest("GET", "/api/credentials");
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any[];
    expect(body).toHaveLength(1);
  });

  test("GET /api/credentials — without vault returns 400", async () => {
    const { db: db2, dispatcher: d2 } = buildRouteContext();
    const req = makeRequest("GET", "/api/credentials");
    const res = await handleApiRoute(db2, d2, req);
    expect(res!.status).toBe(400);
  });

  test("POST /api/credentials — create (with vault)", async () => {
    const req = makeRequest("POST", "/api/credentials", {
      name: "New Cred",
      type: "api-key",
      values: { key: "sk-test" },
    });
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(201);
    const body = await res!.json() as any;
    expect(body.id).toBeDefined();
    expect(body.name).toBe("New Cred");
  });

  test("POST /api/credentials — missing fields returns 400", async () => {
    const req = makeRequest("POST", "/api/credentials", { name: "Partial" });
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(400);
  });

  test("GET /api/credentials/:id — get (with vault)", async () => {
    const id = vault.storeCredential("Fetch Cred", "basic", { user: "admin", pass: "secret" });
    const req = makeRequest("GET", `/api/credentials/${id}`);
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.id).toBe(id);
    expect(body.name).toBe("Fetch Cred");
  });

  test("GET /api/credentials/:id — not found returns 404", async () => {
    const req = makeRequest("GET", "/api/credentials/no-such");
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(404);
  });

  test("PUT /api/credentials/:id — update (with vault)", async () => {
    const id = vault.storeCredential("Update Cred", "basic", { user: "old", pass: "old" });
    const req = makeRequest("PUT", `/api/credentials/${id}`, {
      values: { user: "new", pass: "new" },
    });
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.values.user).toBe("new");
  });

  test("PUT /api/credentials/:id — not found returns 404", async () => {
    const req = makeRequest("PUT", "/api/credentials/no-such", {
      values: { key: "val" },
    });
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(404);
  });

  test("DELETE /api/credentials/:id — delete (with vault)", async () => {
    const id = vault.storeCredential("Del Cred", "api-key", { token: "abc" });
    const req = makeRequest("DELETE", `/api/credentials/${id}`);
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.success).toBe(true);
  });

  test("DELETE /api/credentials/:id — not found returns 404", async () => {
    const req = makeRequest("DELETE", "/api/credentials/no-such");
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, vault);
    expect(res!.status).toBe(404);
  });
});

describe("Route handlers — env", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;
  let appDb: AppDatabase;
  let envResolver: EnvResolver;

  beforeEach(() => {
    db = createTestDb();
    appDb = new AppDatabase(db);
    const vault = new CredentialVault(appDb);
    envResolver = new EnvResolver(appDb, vault);
    dispatcher = new AgentDispatcher(vault, envResolver);
  });

  test("GET /api/env — list (with envResolver)", async () => {
    envResolver.setVar("global", null, "API_URL", "https://example.com", false);
    const req = makeRequest("GET", "/api/env");
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, undefined, envResolver);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any[];
    expect(body).toHaveLength(1);
  });

  test("GET /api/env — without envResolver returns 400", async () => {
    const { db: db2, dispatcher: d2 } = buildRouteContext();
    const req = makeRequest("GET", "/api/env");
    const res = await handleApiRoute(db2, d2, req);
    expect(res!.status).toBe(400);
  });

  test("POST /api/env — set (with envResolver)", async () => {
    const req = makeRequest("POST", "/api/env", {
      scope: "global",
      scopeId: null,
      key: "MY_VAR",
      value: "hello",
      isSecret: false,
    });
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, undefined, envResolver);
    expect(res!.status).toBe(201);
    const body = await res!.json() as any;
    expect(body.success).toBe(true);
  });

  test("POST /api/env — missing required fields returns 400", async () => {
    const req = makeRequest("POST", "/api/env", { key: "no-scope" });
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, undefined, envResolver);
    expect(res!.status).toBe(400);
  });

  test("DELETE /api/env — delete (with envResolver)", async () => {
    envResolver.setVar("global", null, "DEL_ME", "bye", false);
    const req = makeRequest("DELETE", "/api/env?scope=global&key=DEL_ME");
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, undefined, envResolver);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.success).toBe(true);
  });

  test("DELETE /api/env — missing scope or key returns 400", async () => {
    const req = makeRequest("DELETE", "/api/env?scope=global");
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, undefined, envResolver);
    expect(res!.status).toBe(400);
  });

  test("DELETE /api/env — not found returns 404", async () => {
    const req = makeRequest("DELETE", "/api/env?scope=global&key=NO_VAR");
    const res = await handleApiRoute(db, dispatcher, req, undefined, undefined, undefined, appDb, undefined, envResolver);
    expect(res!.status).toBe(404);
  });
});

describe("Route handlers — settings", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    const ctx = buildRouteContext();
    db = ctx.db;
    dispatcher = ctx.dispatcher;
  });

  test("GET /api/settings — get", async () => {
    const req = makeRequest("GET", "/api/settings");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.aiModel).toBeDefined();
  });

  test("PUT /api/settings — update", async () => {
    const req = makeRequest("PUT", "/api/settings", { aiModel: "openai/gpt-4o" });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(200);
    const body = await res!.json() as any;
    expect(body.aiModel).toBe("openai/gpt-4o");
  });
});

describe("Route handlers — agents", () => {
  let db: Database;
  let dispatcher: AgentDispatcher;

  beforeEach(() => {
    const ctx = buildRouteContext();
    db = ctx.db;
    dispatcher = ctx.dispatcher;
  });

  test("GET /api/agents — without hub returns 400", async () => {
    const req = makeRequest("GET", "/api/agents");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(400);
  });

  test("POST /api/agents/:id/update — without hub returns 400", async () => {
    const req = makeRequest("POST", "/api/agents/agent-1/update");
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(400);
  });

  test("PUT /api/agents/:id/tags — without hub returns 400", async () => {
    const req = makeRequest("PUT", "/api/agents/agent-1/tags", { tags: ["prod"] });
    const res = await handleApiRoute(db, dispatcher, req);
    expect(res!.status).toBe(400);
  });
});
