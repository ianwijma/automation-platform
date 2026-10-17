import { createDatabase } from "../db/database.js";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { WssHub } from "./wss-hub.js";
import type {
  AgentClientMessage,
  AgentDispatchMessage,
  AgentNodeResultMessage,
} from "../core/agent-protocol.js";

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
  return createDatabase(":memory:").db;
}

function createMockWs(
  data: { connectedAt: number; agentId: string | null } = {
    connectedAt: Date.now(),
    agentId: null,
  },
) {
  const sent: string[] = [];
  const state = { closed: false, closeCode: 0, closeReason: "" };
  return {
    data,
    sent,
    state,
    send(msg: string) {
      sent.push(msg);
    },
    close(code: number, reason: string) {
      state.closed = true;
      state.closeCode = code;
      state.closeReason = reason;
    },
  } as any;
}

describe("WssHub", () => {
  let hub: WssHub;

  beforeEach(() => {
    hub = new WssHub();
  });

  afterEach(() => {
    hub.close();
  });

  test("construction without db", () => {
    expect(hub).toBeDefined();
    expect(hub.getConnectedAgents()).toEqual([]);
  });

  test("construction with db", () => {
    const db = createTestDb();
    const h = new WssHub(db);
    expect(h).toBeDefined();
    h.close();
    db.close();
  });

  test("addAgent and getAgentConnection", () => {
    const ws = createMockWs();
    const helloMsg = {
      type: "hello" as const,
      name: "test-agent",
      version: "1.0.0",
      caps: {
        os: "linux",
        arch: "x64",
        display: "none" as const,
        tools: [],
        screen: false,
        input: "none" as const,
      },
      token: "test-token",
    };

    hub.handleMessage(ws, JSON.stringify(helloMsg));

    const welcome = JSON.parse(ws.sent[0]);
    expect(welcome.type).toBe("welcome");
    expect(welcome.agentId).toBeDefined();

    const conn = hub.getAgentConnection(welcome.agentId);
    expect(conn).toBeDefined();
    expect(conn!.name).toBe("test-agent");
  });

  test("removeAgent on disconnect", () => {
    const ws = createMockWs();
    const helloMsg = {
      type: "hello" as const,
      name: "disconnect-agent",
      version: "1.0.0",
      caps: {
        os: "linux",
        arch: "x64",
        display: "none" as const,
        tools: [],
        screen: false,
        input: "none" as const,
      },
      token: "test-token",
    };

    hub.handleMessage(ws, JSON.stringify(helloMsg));
    const welcome = JSON.parse(ws.sent[0]);
    const agentId = welcome.agentId;

    hub.handleClose(ws);
    expect(hub.getAgentConnection(agentId)).toBeUndefined();
  });

  test("heartbeat tracking", () => {
    const ws = createMockWs();
    const helloMsg = {
      type: "hello" as const,
      name: "hb-agent",
      version: "1.0.0",
      caps: {
        os: "linux",
        arch: "x64",
        display: "none" as const,
        tools: [],
        screen: false,
        input: "none" as const,
      },
      token: "test-token",
    };

    hub.handleMessage(ws, JSON.stringify(helloMsg));
    const agentId = JSON.parse(ws.sent[0]).agentId;

    const beforeHb = hub.getAgentConnection(agentId)!.lastHeartbeat;

    const hbMsg: AgentClientMessage = {
      type: "heartbeat",
      agentId,
      timestamp: Date.now(),
    };

    const beforeTime = Date.now();
    hub.handleMessage(ws, JSON.stringify(hbMsg));

    const afterHb = hub.getAgentConnection(agentId)!.lastHeartbeat;
    expect(afterHb).toBeGreaterThanOrEqual(beforeTime - 1);
    expect(afterHb).toBeGreaterThan(beforeHb - 1);
  });

  test("listConnectedAgents", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    hub.handleMessage(
      ws1,
      JSON.stringify({
        type: "hello",
        name: "agent-a",
        version: "1.0.0",
        caps: {
          os: "linux",
          arch: "x64",
          display: "none",
          tools: [],
          screen: false,
          input: "none",
        },
        token: "token-a",
      }),
    );
    hub.handleMessage(
      ws2,
      JSON.stringify({
        type: "hello",
        name: "agent-b",
        version: "2.0.0",
        caps: {
          os: "darwin",
          arch: "arm64",
          display: "none",
          tools: [],
          screen: false,
          input: "none",
        },
        token: "token-b",
      }),
    );

    const agents = hub.getConnectedAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.name).sort()).toEqual(["agent-a", "agent-b"]);
    expect(agents.every((a) => a.status === "online")).toBe(true);
  });

  test("dispatch routing - dispatches to connected agent", async () => {
    const ws = createMockWs();
    hub.handleMessage(
      ws,
      JSON.stringify({
        type: "hello",
        name: "dispatch-agent",
        version: "1.0.0",
        caps: {
          os: "linux",
          arch: "x64",
          display: "none",
          tools: [],
          screen: false,
          input: "none",
        },
        token: "token-d",
      }),
    );

    const agentId = JSON.parse(ws.sent[0]).agentId;

    const dispatchMsg: AgentDispatchMessage = {
      type: "dispatch",
      nodeExecutionId: "ne-1",
      nodeId: "n1",
      nodeType: "action.shell",
      params: { command: "echo hi" },
      items: [],
      secrets: {},
      env: {},
      runId: "run-1",
      dryRun: false,
      timeoutSec: 5,
    };

    const dispatchPromise = hub.dispatchToAgent(agentId, dispatchMsg, 5);

    const sentMsg = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sentMsg.type).toBe("dispatch");
    expect(sentMsg.nodeExecutionId).toBe("ne-1");

    const resultMsg: AgentNodeResultMessage = {
      type: "node_result",
      nodeExecutionId: "ne-1",
      status: "success",
      items: [{ json: { stdout: "hi" } }],
      durationMs: 50,
    };

    hub.handleMessage(ws, JSON.stringify(resultMsg));

    const result = await dispatchPromise;
    expect(result.nodeExecutionId).toBe("ne-1");
    expect(result.status).toBe("success");
  });

  test("dispatch to disconnected agent rejects", async () => {
    const dispatchMsg: AgentDispatchMessage = {
      type: "dispatch",
      nodeExecutionId: "ne-2",
      nodeId: "n1",
      nodeType: "action.shell",
      params: {},
      items: [],
      secrets: {},
      env: {},
      runId: "run-2",
      dryRun: false,
      timeoutSec: 5,
    };

    expect(hub.dispatchToAgent("nonexistent", dispatchMsg, 5)).rejects.toThrow(
      "not connected",
    );
  });

  test("hello with db validates join token", () => {
    const db = createTestDb();
    const h = new WssHub(db);

    const { createHash, randomUUID } = require("node:crypto");
    const token = randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    db.prepare(
      "INSERT INTO join_tokens (token_hash, uses_left, expires_at) VALUES (?, ?, ?)",
    ).run(tokenHash, 1, new Date(Date.now() + 3600000).toISOString());

    const ws = createMockWs();
    h.handleMessage(
      ws,
      JSON.stringify({
        type: "hello",
        name: "token-agent",
        version: "1.0.0",
        caps: {
          os: "linux",
          arch: "x64",
          display: "none",
          tools: [],
          screen: false,
          input: "none",
        },
        token,
      }),
    );

    expect(ws.sent.length).toBe(1);
    const welcome = JSON.parse(ws.sent[0]);
    expect(welcome.type).toBe("welcome");

    const usesLeft = db
      .query<
        { uses_left: number },
        [string]
      >("SELECT uses_left FROM join_tokens WHERE token_hash = ?")
      .get(tokenHash)!;
    expect(usesLeft.uses_left).toBe(0);

    h.close();
    db.close();
  });

  test("hello with invalid token closes ws", () => {
    const db = createTestDb();
    const h = new WssHub(db);

    const ws = createMockWs();
    h.handleMessage(
      ws,
      JSON.stringify({
        type: "hello",
        name: "bad-token-agent",
        version: "1.0.0",
        caps: {
          os: "linux",
          arch: "x64",
          display: "none",
          tools: [],
          screen: false,
          input: "none",
        },
        token: "invalid-token",
      }),
    );

    expect(ws.state.closed).toBe(true);
    expect(ws.state.closeCode).toBe(4003);

    h.close();
    db.close();
  });

  test("onMessage registers handler", () => {
    const messages: Array<{ agentId: string; msg: AgentClientMessage }> = [];
    hub.onMessage((agentId, msg) => {
      messages.push({ agentId, msg });
    });

    const ws = createMockWs();
    hub.handleMessage(
      ws,
      JSON.stringify({
        type: "hello",
        name: "msg-agent",
        version: "1.0.0",
        caps: {
          os: "linux",
          arch: "x64",
          display: "none",
          tools: [],
          screen: false,
          input: "none",
        },
        token: "test-token",
      }),
    );

    const agentId = JSON.parse(ws.sent[0]).agentId;

    hub.handleMessage(
      ws,
      JSON.stringify({
        type: "heartbeat",
        agentId,
        timestamp: Date.now(),
      }),
    );

    expect(messages.map((m) => m.msg.type)).toEqual(["hello", "heartbeat"]);
    expect(messages[1].msg.type).toBe("heartbeat");
  });
});
