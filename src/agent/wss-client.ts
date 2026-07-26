import { createHash, randomUUID } from "node:crypto";
import type {
  AgentClientMessage,
  AgentServerMessage,
  AgentHelloMessage,
  AgentHeartbeatMessage,
  AgentNodeResultMessage,
  AgentCapabilitiesMessage,
} from "../core/agent-protocol.js";
import type { CapabilityReport, NodeItem, RunContext } from "../core/node-contract.js";
import type { NodeDefinition } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { probeCapabilities } from "./capability-probe.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const BASE_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

type ConnectionState = "disconnected" | "connecting" | "connected";

export class WssAgentClient {
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
  }) {
    this.name = options.name;
    this.version = options.version;
    this.token = options.token;
    this.url = "";
  }

  async connect(url: string): Promise<void> {
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

      this.ws.addEventListener("close", () => {
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

  private handleMessage(msg: AgentServerMessage, connectResolve?: (value: void) => void): void {
    switch (msg.type) {
      case "welcome": {
        this.agentId = msg.agentId;
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

  private async handleDispatch(msg: AgentServerMessage & { type: "dispatch" }): Promise<void> {
    const { nodeExecutionId, nodeId, nodeType, params, items, secrets, env, runId, dryRun, timeoutSec } = msg;

    const ac = new AbortController();
    this.currentExecutions.set(nodeExecutionId, ac);

    const nodeDef = nodeRegistry.lookup(nodeType);
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

    const ctx: RunContext = {
      nodeId: nodeExecutionId,
      nodeName: nodeDef.displayName,
      params,
      items,
      env,
      secrets,
      state: {
        get: () => undefined,
        set: () => {},
      },
      now: new Date(),
      agentId: this.agentId ?? "unknown",
      runId,
      dryRun,
    };

    const start = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Execution timed out")), timeoutSec * 1000);
      });

      const execPromise = dryRun && nodeDef.simulate
        ? nodeDef.simulate(ctx).then((report) => report.data ?? [])
        : nodeDef.run(ctx);

      const result = await Promise.race([execPromise, timeoutPromise]);

      if (timeoutId) clearTimeout(timeoutId);

      this.sendNodeResult({
        type: "node_result",
        nodeExecutionId,
        status: "success",
        items: result,
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);

      const status = ac.signal.aborted ? "cancelled" : (err?.message?.includes("timed out") ? "timeout" : "error");
      this.sendNodeResult({
        type: "node_result",
        nodeExecutionId,
        status,
        error: err?.message ?? String(err),
        durationMs: Date.now() - start,
      });
    } finally {
      this.currentExecutions.delete(nodeExecutionId);
    }
  }

  private async handleSelfUpdate(url: string, expectedSha256: string): Promise<void> {
    try {
      console.log("Downloading update...");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const data = await response.arrayBuffer();
      const buffer = Buffer.from(data);

      const actualSha256 = createHash("sha256").update(buffer).digest("hex");
      if (actualSha256 !== expectedSha256) {
        throw new Error(`SHA256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
      }

      const tmpPath = `/tmp/ap-agent-update-${Date.now()}`;
      const { writeFileSync, renameSync, chmodSync } = await import("node:fs");

      writeFileSync(tmpPath, buffer);
      chmodSync(tmpPath, 0o755);

      const currentExe = process.execPath;
      renameSync(tmpPath, currentExe);

      console.log("Update applied, restarting...");
      Bun.spawn({
        cmd: [currentExe, ...process.argv.slice(1)],
        env: process.env,
        stdio: ["inherit", "inherit", "inherit"],
      });
      process.exit(0);
    } catch (err: any) {
      console.error("Self-update failed:", err?.message ?? err);
    }
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
    if (this.reconnectTimer) return;

    const delay = Math.min(BASE_RECONNECT_DELAY_MS * (this.reconnectAttempt + 1), MAX_RECONNECT_DELAY_MS);
    console.log(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempt + 1})`);

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
