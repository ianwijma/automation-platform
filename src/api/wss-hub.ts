import { createHash, randomUUID } from "node:crypto";
import type { ServerWebSocket } from "bun";
import type { Database } from "bun:sqlite";
import type {
  AgentClientMessage,
  AgentServerMessage,
  AgentHelloMessage,
  AgentNodeResultMessage,
  AgentDispatchMessage,
  AgentCancelMessage,
} from "../core/agent-protocol.js";
import type { CapabilityReport } from "../core/node-contract.js";

interface WsData {
  connectedAt: number;
  agentId: string | null;
}

interface AgentConnection {
  ws: ServerWebSocket<WsData>;
  agentId: string;
  name: string;
  version: string;
  capabilities: CapabilityReport;
  lastHeartbeat: number;
  connectedAt: number;
  tags: string[];
  missedBeats: number;
}

interface PendingExecution {
  resolve: (result: AgentNodeResultMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type MessageHandler = (agentId: string, message: AgentClientMessage) => void;

const HEARTBEAT_TIMEOUT_MS = 45_000;
const MISSED_BEATS_THRESHOLD = 2;
const HEARTBEAT_CHECK_INTERVAL_MS = 20_000;

export class WssHub {
  private connections = new Map<string, AgentConnection>();
  private wsToAgent = new Map<ServerWebSocket<WsData>, string>();
  private pendingExecutions = new Map<string, PendingExecution>();
  private messageHandlers: MessageHandler[] = [];
  private heartbeatCheckTimer: ReturnType<typeof setInterval> | null = null;
  private db: Database | null = null;

  constructor(db?: Database) {
    this.db = db ?? null;
  }

  handleOpen(ws: ServerWebSocket<WsData>): void {
  }

  handleMessage(ws: ServerWebSocket<WsData>, rawMessage: string | Buffer): void {
    try {
      const data = typeof rawMessage === "string" ? rawMessage : String(rawMessage);
      const msg = JSON.parse(data) as AgentClientMessage;

      if (msg.type === "hello") {
        const agentId = this.handleHello(ws, msg);
        if (agentId) {
          ws.data.agentId = agentId;
          this.wsToAgent.set(ws, agentId);
        }
        return;
      }

      const agentId = ws.data.agentId;
      if (!agentId) {
        ws.close(4001, "Not authenticated");
        return;
      }

      this.handleClientMessage(agentId, msg);
    } catch {
      ws.close(4002, "Invalid message");
    }
  }

  handleClose(ws: ServerWebSocket<WsData>): void {
    const agentId = this.wsToAgent.get(ws) ?? ws.data.agentId;
    if (agentId) {
      this.handleDisconnect(agentId);
      this.wsToAgent.delete(ws);
    }
  }

  private handleHello(ws: ServerWebSocket<WsData>, msg: AgentHelloMessage): string | null {
    const tokenHash = createHash("sha256").update(msg.token).digest("hex");

    if (this.db) {
      const tokenRow = this.db.query<{ token_hash: string; uses_left: number; expires_at: string }, [string]>(
        "SELECT * FROM join_tokens WHERE token_hash = ? AND uses_left > 0 AND expires_at > datetime('now')",
      ).get(tokenHash);

      if (!tokenRow) {
        ws.close(4003, "Invalid or expired join token");
        return null;
      }

      this.db.prepare("UPDATE join_tokens SET uses_left = uses_left - 1 WHERE token_hash = ?").run(tokenHash);
    }

    let agentId: string = randomUUID();

    const conn: AgentConnection = {
      ws,
      agentId,
      name: msg.name,
      version: msg.version,
      capabilities: msg.caps,
      lastHeartbeat: Date.now(),
      connectedAt: Date.now(),
      tags: [],
      missedBeats: 0,
    };

    if (this.db) {
      const now = new Date().toISOString();
      const existing = this.db.query<{ id: string }, [string]>(
        "SELECT id FROM agents WHERE name = ? AND is_local = 0",
      ).get(msg.name);

      if (existing) {
        this.db.prepare(
          "UPDATE agents SET capabilities_json = ?, version = ?, status = 'online', last_seen_at = ? WHERE id = ?",
        ).run(JSON.stringify(msg.caps), msg.version, now, existing.id);
        agentId = existing.id;
        conn.agentId = existing.id;
      } else {
        this.db.prepare(
          "INSERT INTO agents (id, name, is_local, tags_json, capabilities_json, version, status, last_seen_at, enrolled_at) VALUES (?, ?, 0, '[]', ?, ?, 'online', ?, ?)",
        ).run(agentId, msg.name, JSON.stringify(msg.caps), msg.version, now, now);
      }
    }

    this.connections.set(agentId, conn);

    const welcome: AgentServerMessage & { type: "welcome" } = {
      type: "welcome",
      agentId,
    };
    ws.send(JSON.stringify(welcome));

    if (!this.heartbeatCheckTimer) {
      this.startHeartbeatCheck();
    }

    return agentId;
  }

  private handleClientMessage(agentId: string, msg: AgentClientMessage): void {
    const conn = this.connections.get(agentId);
    if (!conn) return;

    switch (msg.type) {
      case "heartbeat": {
        conn.lastHeartbeat = Date.now();
        conn.missedBeats = 0;

        if (this.db) {
          this.db.prepare("UPDATE agents SET status = 'online', last_seen_at = ? WHERE id = ?")
            .run(new Date().toISOString(), agentId);
        }
        break;
      }

      case "capabilities": {
        conn.capabilities = msg.caps;
        if (this.db) {
          this.db.prepare("UPDATE agents SET capabilities_json = ? WHERE id = ?")
            .run(JSON.stringify(msg.caps), agentId);
        }
        break;
      }

      case "node_result": {
        this.handleNodeResult(msg);
        break;
      }

      case "node_log": {
        break;
      }

      case "artifact_request": {
        break;
      }
    }

    for (const handler of this.messageHandlers) {
      handler(agentId, msg);
    }
  }

  private handleNodeResult(msg: AgentNodeResultMessage): void {
    const pending = this.pendingExecutions.get(msg.nodeExecutionId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingExecutions.delete(msg.nodeExecutionId);
    pending.resolve(msg);
  }

  private handleDisconnect(agentId: string): void {
    this.connections.delete(agentId);

    if (this.db) {
      this.db.prepare("UPDATE agents SET status = 'offline', last_seen_at = ? WHERE id = ?")
        .run(new Date().toISOString(), agentId);
    }
  }

  private startHeartbeatCheck(): void {
    this.heartbeatCheckTimer = setInterval(() => {
      const now = Date.now();

      for (const [agentId, conn] of this.connections) {
        const elapsed = now - conn.lastHeartbeat;
        if (elapsed > HEARTBEAT_TIMEOUT_MS) {
          conn.missedBeats++;
          if (conn.missedBeats >= MISSED_BEATS_THRESHOLD) {
            console.log(`Agent ${agentId} missed ${conn.missedBeats} heartbeats, marking offline`);
            conn.ws.close(4004, "Heartbeat timeout");
            this.handleDisconnect(agentId);
          }
        }
      }

      if (this.connections.size === 0 && this.heartbeatCheckTimer) {
        clearInterval(this.heartbeatCheckTimer);
        this.heartbeatCheckTimer = null;
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);
  }

  broadcastToAgent(agentId: string, message: AgentServerMessage): boolean {
    const conn = this.connections.get(agentId);
    if (!conn) {
      return false;
    }
    conn.ws.send(JSON.stringify(message));
    return true;
  }

  dispatchToAgent(agentId: string, msg: AgentDispatchMessage, timeoutSec: number): Promise<AgentNodeResultMessage> {
    return new Promise((resolve, reject) => {
      const conn = this.connections.get(agentId);
      if (!conn) {
        reject(new Error(`Agent ${agentId} is not connected`));
        return;
      }

      const timer = setTimeout(() => {
        this.pendingExecutions.delete(msg.nodeExecutionId);
        const cancelMsg: AgentCancelMessage = {
          type: "cancel",
          nodeExecutionId: msg.nodeExecutionId,
        };
        this.broadcastToAgent(agentId, cancelMsg);
        reject(new Error(`Dispatch to agent ${agentId} timed out after ${timeoutSec}s`));
      }, timeoutSec * 1000);

      this.pendingExecutions.set(msg.nodeExecutionId, { resolve, reject, timer });

      this.broadcastToAgent(agentId, msg);
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  getAgentConnection(agentId: string): AgentConnection | undefined {
    return this.connections.get(agentId);
  }

  getConnectedAgents(): Array<{
    agentId: string;
    name: string;
    version: string;
    capabilities: CapabilityReport;
    tags: string[];
    status: "online";
  }> {
    return [...this.connections.values()].map((conn) => ({
      agentId: conn.agentId,
      name: conn.name,
      version: conn.version,
      capabilities: conn.capabilities,
      tags: conn.tags,
      status: "online" as const,
    }));
  }

  updateAgentTags(agentId: string, tags: string[]): void {
    const conn = this.connections.get(agentId);
    if (conn) {
      conn.tags = tags;
    }

    if (this.db) {
      this.db.prepare("UPDATE agents SET tags_json = ? WHERE id = ?")
        .run(JSON.stringify(tags), agentId);
    }
  }

  close(): void {
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer);
      this.heartbeatCheckTimer = null;
    }

    for (const conn of this.connections.values()) {
      conn.ws.close(1001, "Server shutting down");
    }
    this.connections.clear();

    for (const pending of this.pendingExecutions.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server shutting down"));
    }
    this.pendingExecutions.clear();
  }
}
