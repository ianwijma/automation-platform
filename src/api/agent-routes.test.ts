import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { listAgents, createJoinToken, updateAgentTags, triggerAgentUpdate } from "./agent-routes.js";
import { WssHub } from "./wss-hub.js";

const MIGRATION_SQL = `
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

CREATE TABLE IF NOT EXISTS join_tokens (
  token_hash TEXT PRIMARY KEY,
  uses_left INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL
);
`;

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return db;
}

describe("listAgents", () => {
  let db: Database;
  let hub: WssHub;

  beforeEach(() => {
    db = createTestDb();
    hub = new WssHub(db);
  });

  test("returns empty list when no agents", async () => {
    const res = listAgents(db, hub);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("returns agents from database", async () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO agents (id, name, is_local, tags_json, capabilities_json, version, status, last_seen_at, enrolled_at) VALUES (?, ?, 0, '[]', '{}', '1.0.0', 'offline', ?, ?)",
    ).run("agent-1", "Test Agent", now, now);

    const res = listAgents(db, hub);
    const body = await res.json() as any[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("agent-1");
    expect(body[0].name).toBe("Test Agent");
    expect(body[0].status).toBe("offline");
    expect(body[0].isLocal).toBe(false);
  });

  test("returns online status for connected agents", async () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO agents (id, name, is_local, tags_json, capabilities_json, version, status, last_seen_at, enrolled_at) VALUES (?, ?, 0, '[]', '{}', '1.0.0', 'offline', ?, ?)",
    ).run("agent-2", "Offline Agent", now, now);

    const hubNoDb = new WssHub();
    const ws = createMockWs();
    hubNoDb.handleMessage(ws, JSON.stringify({
      type: "hello",
      name: "Online Agent",
      version: "2.0.0",
      caps: { os: "linux", arch: "x64", display: "none", tools: [], screen: false, input: "none" },
      token: "test-token",
    }));
    const onlineAgentId = JSON.parse(ws.sent[0]).agentId;

    db.prepare(
      "INSERT INTO agents (id, name, is_local, tags_json, capabilities_json, version, status, last_seen_at, enrolled_at) VALUES (?, ?, 0, '[]', '{}', '2.0.0', 'online', ?, ?)",
    ).run(onlineAgentId, "Online Agent", now, now);

    const res = listAgents(db, hubNoDb);
    const body = await res.json() as any[];
    expect(body.length).toBeGreaterThanOrEqual(2);
    const onlineAgent = body.find((a: any) => a.name === "Online Agent");
    expect(onlineAgent).toBeDefined();
    expect(onlineAgent!.status).toBe("online");
    hubNoDb.close();
  });
});

describe("createJoinToken", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("creates token with defaults", async () => {
    const res = createJoinToken(db, {});
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.token).toBeDefined();
    expect(body.usesLeft).toBe(1);
    expect(body.expiresAt).toBeDefined();
  });

  test("creates token with custom uses and ttl", async () => {
    const res = createJoinToken(db, { uses: 5, ttlHours: 24 });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.usesLeft).toBe(5);
    expect(body.expiresAt).toBeDefined();
  });

  test("token is stored in database", async () => {
    const res = createJoinToken(db, { uses: 3 });
    const body = await res.json() as any;
    const { createHash } = await import("node:crypto");
    const tokenHash = createHash("sha256").update(body.token).digest("hex");
    const row = db.query<{ uses_left: number; expires_at: string }, [string]>(
      "SELECT uses_left, expires_at FROM join_tokens WHERE token_hash = ?",
    ).get(tokenHash);
    expect(row).not.toBeNull();
    expect(row!.uses_left).toBe(3);
  });
});

describe("updateAgentTags", () => {
  let db: Database;
  let hub: WssHub;

  beforeEach(() => {
    db = createTestDb();
    hub = new WssHub(db);
  });

  test("updates tags for existing agent", async () => {
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO agents (id, name, is_local, tags_json, capabilities_json, version, status, last_seen_at, enrolled_at) VALUES (?, ?, 0, '[]', '{}', '1.0.0', 'offline', ?, ?)",
    ).run("agent-tag", "Tag Agent", now, now);

    const res = updateAgentTags(db, hub, "agent-tag", ["prod", "web"]);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.id).toBe("agent-tag");
    expect(body.tags).toEqual(["prod", "web"]);

    const row = db.query<{ tags_json: string }, [string]>("SELECT tags_json FROM agents WHERE id = ?").get("agent-tag")!;
    expect(JSON.parse(row.tags_json)).toEqual(["prod", "web"]);
  });

  test("returns 404 for nonexistent agent", async () => {
    const res = updateAgentTags(db, hub, "no-such-agent", ["tag"]);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe("Agent not found");
  });
});

describe("triggerAgentUpdate", () => {
  let hub: WssHub;

  beforeEach(() => {
    hub = new WssHub();
  });

  afterAll(() => {
    hub.close();
  });

  test("returns 404 when agent not connected", async () => {
    const res = triggerAgentUpdate(hub, "no-such-agent");
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe("Agent not connected");
  });

  test("sends self_update via hub and returns 202 when agent connected", async () => {
    const ws = createMockWs();
    hub.handleMessage(ws, JSON.stringify({
      type: "hello",
      name: "Update Agent",
      version: "1.0.0",
      caps: { os: "linux", arch: "x64", display: "none", tools: [], screen: false, input: "none" },
      token: "test-token",
    }));
    const agentId = JSON.parse(ws.sent[0]).agentId;

    const res = triggerAgentUpdate(hub, agentId);
    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.message).toBe("Update triggered");

    const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastSent.type).toBe("self_update");
  });
});

function createMockWs(data: { connectedAt: number; agentId: string | null } = { connectedAt: Date.now(), agentId: null }) {
  const sent: string[] = [];
  return {
    data,
    sent,
    send(msg: string) {
      sent.push(msg);
    },
    close(_code: number, _reason: string) {},
  } as any;
}
