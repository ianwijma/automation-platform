export interface AgentHelloMessage {
  type: "hello";
  caps: import("./node-contract.js").CapabilityReport;
  version: string;
  name: string;
  token: string;
}

export interface AgentWelcomeMessage {
  type: "welcome";
  identityToken?: string;
  agentId: string;
}

export interface AgentCapabilitiesMessage {
  type: "capabilities";
  caps: import("./node-contract.js").CapabilityReport;
}

export interface AgentHeartbeatMessage {
  type: "heartbeat";
  agentId: string;
  timestamp: number;
}

export interface AgentDispatchMessage {
  type: "dispatch";
  protocolVersion?: 2;
  automationId?: string;
  nodeVersion?: number;
  actionTarget?: import("./types.js").ActionTarget;
  inputs?: Record<string, import("./node-contract.js").NodeItem[]>;
  state?: Record<string, unknown>;
  artifactData?: Record<string, string>;
  nodeExecutionId: string;
  nodeId: string;
  nodeType: string;
  params: Record<string, unknown>;
  items: import("./node-contract.js").NodeItem[];
  secrets: Record<string, string>;
  env: Record<string, string>;
  runId: string;
  dryRun: boolean;
  timeoutSec: number;
}

export interface AgentCancelMessage {
  type: "cancel";
  nodeExecutionId: string;
}

export interface AgentNodeResultMessage {
  type: "node_result";
  stateWrites?: Record<string, unknown>;
  simulation?: import("./node-contract.js").SimulationReport;
  nodeExecutionId: string;
  status: "success" | "error" | "timeout" | "cancelled";
  items?: import("./node-contract.js").NodeItem[];
  artifacts?: Array<{
    id: string;
    mime: string;
    size: number;
    name: string;
    data?: string;
  }>;
  error?: string;
  durationMs: number;
}

export interface AgentNodeLogMessage {
  type: "node_log";
  nodeExecutionId: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: number;
}

export interface AgentArtifactRequestMessage {
  type: "artifact_request";
  artifactId: string;
}

export interface AgentArtifactResponseMessage {
  type: "artifact_response";
  artifactId: string;
  data: string;
}

export interface AgentSelfUpdateMessage {
  type: "self_update";
  url: string;
  sha256: string;
}

export interface AgentUpdateAvailableMessage {
  type: "update_available";
  version: string;
  url: string;
  sha256: string;
}

export type AgentClientMessage =
  | AgentHelloMessage
  | AgentCapabilitiesMessage
  | AgentHeartbeatMessage
  | AgentNodeResultMessage
  | AgentNodeLogMessage
  | AgentArtifactRequestMessage;

export type AgentServerMessage =
  | AgentWelcomeMessage
  | AgentDispatchMessage
  | AgentCancelMessage
  | AgentArtifactResponseMessage
  | AgentSelfUpdateMessage
  | AgentUpdateAvailableMessage;

import { z } from "zod";
import { itemSchema } from "./schemas.js";
export const capabilitySchema = z.object({
  os: z.string(),
  arch: z.string(),
  display: z.enum(["x11", "wayland", "none"]),
  tools: z.array(z.string()).max(200),
  screen: z.boolean(),
  input: z.enum(["xdotool", "ydotool", "portal", "none"]),
  gpu: z.boolean().optional(),
});
export const agentClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    protocolVersion: z.literal(2).optional(),
    caps: capabilitySchema,
    version: z.string().max(100),
    name: z.string().min(1).max(200),
    token: z.string().min(1).max(256),
  }),
  z.object({
    type: z.literal("heartbeat"),
    agentId: z.string(),
    timestamp: z.number(),
  }),
  z.object({ type: z.literal("capabilities"), caps: capabilitySchema }),
  z.object({
    type: z.literal("node_result"),
    nodeExecutionId: z.string(),
    status: z.enum(["success", "error", "timeout", "cancelled"]),
    items: z.array(itemSchema).max(10000).optional(),
    durationMs: z.number().nonnegative(),
    error: z.string().optional(),
    stateWrites: z.record(z.string(), z.unknown()).optional(),
    simulation: z
      .object({
        description: z.string(),
        wouldDo: z.string(),
        data: z.array(itemSchema).optional(),
      })
      .optional(),
    artifacts: z
      .array(
        z.object({
          id: z.string().regex(/^[a-f0-9]{64}$/),
          size: z
            .number()
            .int()
            .nonnegative()
            .max(32 * 1024 * 1024),
          mime: z.string(),
          name: z.string(),
          data: z.string().optional(),
        }),
      )
      .max(100)
      .optional(),
  }),
  z.object({
    type: z.literal("node_log"),
    nodeExecutionId: z.string(),
    level: z.enum(["info", "warn", "error"]),
    message: z.string().max(65536),
    timestamp: z.number(),
  }),
  z.object({ type: z.literal("artifact_request"), artifactId: z.string() }),
]);
