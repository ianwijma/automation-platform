import { agentClientMessageSchema } from "../core/agent-protocol.js";
import type { ArtifactStore } from "./artifacts.js";
import { createHash, randomUUID, randomBytes } from "node:crypto";
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
  agentId: string;
  resolve: (result: AgentNodeResultMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type MessageHandler = (agentId: string, message: AgentClientMessage) => void;

const HEARTBEAT_TIMEOUT_MS = 45_000;
const MISSED_BEATS_THRESHOLD = 2;
const HEARTBEAT_CHECK_INTERVAL_MS = 20_000;

export class WssHub {
  artifactStore?: ArtifactStore;
  private handshakes = new Map<
    ServerWebSocket<WsData>,
    ReturnType<typeof setTimeout>
  >();
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
    this.handshakes.set(
      ws,
      setTimeout(() => {
        ws.close(4001, "Handshake timed out");
        this.handshakes.delete(ws);
      }, 10_000),
    );
  }

  handleMessage(
    ws: ServerWebSocket<WsData>,
    rawMessage: string | Buffer,
  ): void {
    try {
      const data =
        typeof rawMessage === "string" ? rawMessage : String(rawMessage);
      if (data.length > 48 * 1024 * 1024) throw new Error("Message too large");
      const msg = agentClientMessageSchema.parse(
        JSON.parse(data),
      ) as AgentClientMessage;
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string")
        throw new Error("Invalid message");

      if (msg.type === "hello") {
        if (ws.data.agentId) throw new Error("Already authenticated");
        clearTimeout(this.handshakes.get(ws));
        this.handshakes.delete(ws);
        const agentId = this.handleHello(ws, msg);
        if (agentId) {
          ws.data.agentId = agentId;
          this.wsToAgent.set(ws, agentId);
          for (const handler of this.messageHandlers) handler(agentId, msg);
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
    clearTimeout(this.handshakes.get(ws));
    this.handshakes.delete(ws);
    const agentId = this.wsToAgent.get(ws) ?? ws.data.agentId;
    if (agentId && this.connections.get(agentId)?.ws === ws) {
      this.handleDisconnect(agentId);
    }
    this.wsToAgent.delete(ws);
  }

  private handleHello(
    ws: ServerWebSocket<WsData>,
    msg: AgentHelloMessage,
  ): string | null {
    if (
      typeof msg.token !== "string" ||
      typeof msg.name !== "string" ||
      !msg.caps ||
      !Array.isArray(msg.caps.tools)
    )
      throw new Error("Invalid hello");
    const tokenHash = createHash("sha256").update(msg.token).digest("hex");
    let agentId = randomUUID() as string;
    let identityToken: string | undefined;
    let tags: string[] = [];
    if (this.db) {
      const identity = this.db
        .query<
          { id: string; tags_json: string },
          [string]
        >("SELECT id,tags_json FROM agents WHERE identity_hash=? AND is_local=0")
        .get(tokenHash);
      if (identity) {
        agentId = identity.id;
        tags = JSON.parse(identity.tags_json);
      } else {
        const accepted = this.db
          .prepare(
            "UPDATE join_tokens SET uses_left=uses_left-1 WHERE token_hash=? AND uses_left>0 AND expires_at>?",
          )
          .run(tokenHash, new Date().toISOString());
        if (!accepted.changes) {
          ws.close(4003, "Invalid or expired agent credential");
          return null;
        }
        identityToken = randomBytes(32).toString("hex");
        this.db
          .prepare(
            "INSERT INTO agents(id,name,is_local,identity_hash) VALUES(?,?,0,?)",
          )
          .run(
            agentId,
            msg.name,
            createHash("sha256").update(identityToken).digest("hex"),
          );
      }
      this.db
        .prepare(
          "UPDATE agents SET name=?,capabilities_json=?,version=?,status='online',last_seen_at=? WHERE id=?",
        )
        .run(
          msg.name,
          JSON.stringify(msg.caps),
          msg.version,
          new Date().toISOString(),
          agentId,
        );
    }
    const conn: AgentConnection = {
      ws,
      agentId,
      name: msg.name,
      version: msg.version,
      capabilities: msg.caps,
      lastHeartbeat: Date.now(),
      connectedAt: Date.now(),
      tags,
      missedBeats: 0,
    };
    const existingConn = this.connections.get(agentId);
    if (existingConn) {
      existingConn.ws.close(4005, "Replaced by new connection");
    }

    this.connections.set(agentId, conn);

    const welcome: AgentServerMessage & { type: "welcome" } = {
      type: "welcome",
      agentId,
      identityToken,
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
          this.db
            .prepare(
              "UPDATE agents SET status = 'online', last_seen_at = ? WHERE id = ?",
            )
            .run(new Date().toISOString(), agentId);
        }
        break;
      }

      case "capabilities": {
        conn.capabilities = msg.caps;
        if (this.db) {
          this.db
            .prepare("UPDATE agents SET capabilities_json = ? WHERE id = ?")
            .run(JSON.stringify(msg.caps), agentId);
        }
        break;
      }

      case "node_result": {
        this.handleNodeResult(agentId, msg);
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

  private handleNodeResult(agentId: string, msg: AgentNodeResultMessage): void {
    const pending = this.pendingExecutions.get(msg.nodeExecutionId);
    if (!pending || pending.agentId !== agentId) return;

    clearTimeout(pending.timer);
    this.pendingExecutions.delete(msg.nodeExecutionId);
    pending.resolve(msg);
  }

  private handleDisconnect(agentId: string): void {
    this.connections.delete(agentId);
    for (const [id, pending] of this.pendingExecutions)
      if (pending.agentId === agentId) {
        clearTimeout(pending.timer);
        pending.reject(
          new Error("Agent disconnected; execution outcome is uncertain"),
        );
        this.pendingExecutions.delete(id);
      }

    if (this.db) {
      this.db
        .prepare(
          "UPDATE agents SET status = 'offline', last_seen_at = ? WHERE id = ?",
        )
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
            console.log(
              `Agent ${agentId} missed ${conn.missedBeats} heartbeats, marking offline`,
            );
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

  dispatchToAgent(
    agentId: string,
    msg: AgentDispatchMessage,
    timeoutSec: number,
  ): Promise<AgentNodeResultMessage> {
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
        reject(
          new Error(
            `Dispatch to agent ${agentId} timed out after ${timeoutSec}s`,
          ),
        );
      }, timeoutSec * 1000);

      this.pendingExecutions.set(msg.nodeExecutionId, {
        agentId,
        resolve,
        reject,
        timer,
      });

      this.broadcastToAgent(agentId, msg);
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  revokeAgent(agentId: string): void {
    this.db
      ?.prepare(
        "UPDATE agents SET identity_hash=NULL WHERE id=? AND is_local=0",
      )
      .run(agentId);
    const ws = this.connections.get(agentId)?.ws;
    ws?.close(4003, "Agent revoked");
    ws?.terminate?.();
    this.handleDisconnect(agentId);
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
      this.db
        .prepare("UPDATE agents SET tags_json = ? WHERE id = ?")
        .run(JSON.stringify(tags), agentId);
    }
  }

  close(): void {
    for (const [ws, timer] of this.handshakes) {
      clearTimeout(timer);
      ws.terminate?.();
    }
    this.handshakes.clear();
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer);
      this.heartbeatCheckTimer = null;
    }

    for (const conn of this.connections.values()) {
      conn.ws.close(1001, "Server shutting down");
      conn.ws.terminate?.();
    }
    this.connections.clear();

    for (const pending of this.pendingExecutions.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Server shutting down"));
    }
    this.pendingExecutions.clear();
  }
}
