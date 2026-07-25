export interface AgentHelloMessage {
  type: "hello";
  caps: import("./node-contract.js").CapabilityReport;
  version: string;
  name: string;
  token: string;
}

export interface AgentWelcomeMessage {
  type: "welcome";
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
  nodeExecutionId: string;
  status: "success" | "error" | "timeout" | "cancelled";
  items?: import("./node-contract.js").NodeItem[];
  artifacts?: Array<{ id: string; mime: string; size: number; name: string; data?: string }>;
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
