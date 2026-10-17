import { LocalAgent } from "./local-agent.js";
import { isLoopback } from "../api/security.js";
import { createHash, randomUUID } from "node:crypto";
import type {
  AgentClientMessage,
  AgentServerMessage,
  AgentHelloMessage,
  AgentHeartbeatMessage,
  AgentNodeResultMessage,
  AgentCapabilitiesMessage,
} from "../core/agent-protocol.js";
import type {
  CapabilityReport,
  NodeItem,
  RunContext,
} from "../core/node-contract.js";
import type { NodeDefinition } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { probeCapabilities } from "./capability-probe.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const BASE_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

type ConnectionState = "disconnected" | "connecting" | "connected";

export class WssAgentClient {
  private stopped = false;
  private onIdentity?: (token: string) => void;
  private ws: WebSocket | null = null;
  private agentId: string | null = null;
  private token: string;
  private url: string;
  private state: ConnectionState = "disconnected";
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentExecutions = new Map<string, AbortController>();
  private name: string;
  private version: string;
  private capabilities: CapabilityReport | null = null;
  private onDisconnected?: () => void;

  constructor(options: {
    name: string;
    version: string;
    token: string;
    onIdentity?: (token: string) => void;
  }) {
    this.name = options.name;
    this.onIdentity = options.onIdentity;
    this.version = options.version;
    this.token = options.token;
    this.url = "";
  }

  async connect(url: string): Promise<void> {
    const parsed = new URL(url);
    if (
      !["https:", "wss:"].includes(parsed.protocol) &&
      !isLoopback(parsed.hostname)
    )
      throw new Error("Remote agents require TLS");
    this.stopped = false;
    this.url = url;
    this.capabilities = await probeCapabilities();

    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = "connecting";

      const wsUrl = this.url.replace(/^http/, "ws");
      const fullUrl = `${wsUrl}/api/agent/connect`;

      this.ws = new WebSocket(fullUrl);

      this.ws.addEventListener("open", () => {
        const hello: AgentHelloMessage = {
          type: "hello",
          caps: this.capabilities!,
          version: this.version,
          name: this.name,
          token: this.token,
        };
        this.ws!.send(JSON.stringify(hello));
      });

      this.ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data as string) as AgentServerMessage;
          this.handleMessage(msg, resolve);
        } catch {
          console.error("Failed to parse server message");
        }
      });

      this.ws.addEventListener("close", (event) => {
        if ([4002, 4003, 4005].includes(event.code)) this.stopped = true;
        if (this.state === "connecting")
          reject(new Error("Agent authentication or connection failed"));
        for (const ac of this.currentExecutions.values())
          ac.abort(new Error("Disconnected"));
        this.state = "disconnected";
        this.stopHeartbeat();
        this.onDisconnected?.();
        this.scheduleReconnect();
      });

      this.ws.addEventListener("error", (event) => {
        console.error("WSS connection error:", event);
        if (this.state === "connecting") {
          reject(new Error("Connection failed"));
        }
      });
    });
  }

  private handleMessage(
    msg: AgentServerMessage,
    connectResolve?: (value: void) => void,
  ): void {
    switch (msg.type) {
      case "welcome": {
        this.agentId = msg.agentId;
        if (msg.identityToken) {
          this.token = msg.identityToken;
          this.onIdentity?.(msg.identityToken);
        }
        this.state = "connected";
        this.reconnectAttempt = 0;
        this.startHeartbeat();
        console.log(`Agent registered: ${this.agentId}`);
        connectResolve?.();
        break;
      }

      case "dispatch": {
        this.handleDispatch(msg).catch((err) => {
          console.error(`Dispatch error for ${msg.nodeExecutionId}:`, err);
        });
        break;
      }

      case "cancel": {
        const ac = this.currentExecutions.get(msg.nodeExecutionId);
        if (ac) {
          ac.abort();
          this.currentExecutions.delete(msg.nodeExecutionId);
        }
        break;
      }

      case "self_update": {
        this.handleSelfUpdate(msg.url, msg.sha256).catch((err) => {
          console.error("Self-update failed:", err);
        });
        break;
      }

      case "artifact_response": {
        break;
      }

      case "update_available": {
        console.log(`Update available: ${msg.version}`);
        break;
      }
    }
  }

  private async handleDispatch(
    msg: AgentServerMessage & { type: "dispatch" },
  ): Promise<void> {
    const {
      nodeExecutionId,
      nodeId,
      nodeType,
      params,
      items,
      secrets,
      env,
      runId,
      dryRun,
      timeoutSec,
    } = msg;

    if (msg.protocolVersion !== 2 || !Number.isInteger(msg.nodeVersion)) {
      this.sendNodeResult({
        type: "node_result",
        nodeExecutionId,
        status: "error",
        error: "Incompatible dispatch protocol; upgrade the agent",
        durationMs: 0,
      });
      return;
    }
    const ac = new AbortController();
    this.currentExecutions.set(nodeExecutionId, ac);

    const nodeDef = nodeRegistry.lookup(nodeType, msg.nodeVersion);
    if (!nodeDef) {
      this.sendNodeResult({
        type: "node_result",
        nodeExecutionId,
        status: "error",
        error: `Unknown node type: ${nodeType}`,
        durationMs: 0,
      });
      this.currentExecutions.delete(nodeExecutionId);
      return;
    }

    const local = new LocalAgent();
    local.agentId = this.agentId ?? "unknown";
    const state = { ...(msg.state ?? {}) },
      stateWrites: Record<string, unknown> = {};
    const artifacts: NonNullable<AgentNodeResultMessage["artifacts"]> = [];
    const start = Date.now();
    try {
      const result = await local.send(
        nodeExecutionId,
        nodeDef,
        params,
        items,
        secrets,
        env,
        dryRun,
        timeoutSec,
        {
          get: (key) => state[key],
          set: (key, value) => {
            state[key] = value;
            stateWrites[key] = value;
          },
        },
        runId,
        msg.automationId ?? "unknown",
        {
          nodeId,
          nodeName: nodeDef.displayName,
          stateSnapshot: state,
          actionTarget: msg.actionTarget,
          inputs: msg.inputs ?? {},
          signal: ac.signal,
          artifacts: {
            async read(ref) {
              const data = msg.artifactData?.[ref.$artifact];
              if (!data) throw new Error("Artifact unavailable");
              return Buffer.from(data, "base64");
            },
            async store(data, mime, name) {
              const bytes = Buffer.from(data as Uint8Array);
              if (bytes.length > 32 * 1024 * 1024)
                throw new Error("Artifact too large");
              const id = createHash("sha256").update(bytes).digest("hex");
              artifacts.push({
                id,
                mime,
                size: bytes.length,
                name,
                data: bytes.toString("base64"),
              });
              return { $artifact: id, mime, size: bytes.length, name };
            },
          },
        },
      );
      this.sendNodeResult({
        type: "node_result",
        nodeExecutionId,
        status: result.error ? "error" : "success",
        ...result,
        stateWrites: result.error ? undefined : stateWrites,
        artifacts: result.error ? undefined : artifacts,
      });
    } catch (error) {
      this.sendNodeResult({
        type: "node_result",
        nodeExecutionId,
        status: ac.signal.aborted ? "cancelled" : "error",
        error: String(error),
        durationMs: Date.now() - start,
      });
    } finally {
      this.currentExecutions.delete(nodeExecutionId);
    }
  }

  private async handleSelfUpdate(
    url: string,
    expectedSha256: string,
  ): Promise<void> {
    throw new Error(
      "Self-update is disabled until verified releases and rollback are available; install a verified package manually",
    );
  }

  private sendNodeResult(msg: AgentNodeResultMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN && this.agentId) {
        const hb: AgentHeartbeatMessage = {
          type: "heartbeat",
          agentId: this.agentId,
          timestamp: Date.now(),
        };
        this.ws.send(JSON.stringify(hb));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * (this.reconnectAttempt + 1),
      MAX_RECONNECT_DELAY_MS,
    );
    console.log(
      `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempt + 1})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      try {
        await this.doConnect();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  sendCapabilities(caps: CapabilityReport): void {
    const msg: AgentCapabilitiesMessage = {
      type: "capabilities",
      caps,
    };
    this.capabilities = caps;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.stopped = true;
    for (const ac of this.currentExecutions.values())
      ac.abort(new Error("Disconnected"));
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = "disconnected";
  }

  getAgentId(): string | null {
    return this.agentId;
  }

  isConnected(): boolean {
    return this.state === "connected";
  }

  setOnDisconnected(fn: () => void): void {
    this.onDisconnected = fn;
  }
}
