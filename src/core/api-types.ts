import type { AutomationDefinition, AutomationSettings, AutomationTarget, RetryPolicy } from "./types.js";
import type { NodeItem, CapabilityReport } from "./node-contract.js";

export interface SystemInfoResponse {
  version: string;
  mode: "standalone" | "platform" | "agent";
  uptime: number;
}

export interface AutomationResponse {
  id: string;
  name: string;
  activeVersionId: string | null;
  settings: AutomationSettings;
  draft: AutomationDefinition | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationVersionResponse {
  id: string;
  automationId: string;
  versionNo: number;
  definition: AutomationDefinition;
  label: string | null;
  createdAt: string;
}

export interface RunResponse {
  id: string;
  automationId: string;
  versionId: string;
  mode: "manual" | "trigger" | "dry" | "partial";
  status: "queued" | "running" | "success" | "error" | "interrupted" | "cancelled";
  trigger: Record<string, unknown> | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface NodeExecutionResponse {
  id: string;
  runId: string;
  nodeId: string;
  agentId: string;
  status: "success" | "error" | "timeout" | "cancelled" | "interrupted";
  attempt: number;
  simulated: boolean;
  input: NodeItem[] | null;
  output: NodeItem[] | null;
  pinned: boolean;
  startedAt: string;
  durationMs: number;
  error: string | null;
}

export interface AgentResponse {
  id: string;
  name: string;
  isLocal: boolean;
  tags: string[];
  capabilities: CapabilityReport;
  version: string;
  status: "online" | "offline" | "connecting";
  lastSeenAt: string | null;
  enrolledAt: string;
}

export interface CredentialResponse {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

export interface EnvVarResponse {
  scope: "global" | "automation" | "machine";
  scopeId: string | null;
  key: string;
  isSecret: boolean;
  value?: string;
}

export interface RunRequest {
  mode?: "manual" | "partial" | "single-node";
  dryRun?: boolean;
  fromNodeId?: string;
  pinData?: Record<string, NodeItem[]>;
}

export interface ExportResponse {
  automation: AutomationDefinition;
  credentials: Array<{ type: string; name: string }>;
  envVars: Array<{ scope: string; scopeId: string | null; key: string; isSecret: boolean }>;
  agentMapping: Record<string, string[]>;
}

export interface ImportRequest {
  automation: AutomationDefinition;
  credentials: Record<string, { type: string; value: string }>;
  envVars: Record<string, { value: string; isSecret: boolean }>;
  targetRebinding?: Record<string, AutomationTarget>;
}

export interface AiChatRequest {
  messages: Array<{ role: string; content: string }>;
  automationId?: string;
  model?: string;
}

export interface AiChatResponse {
  message: string;
  diffs?: AiDiff[];
}

export interface AiDiff {
  op: "add-node" | "remove-node" | "update-node-params" | "add-edge" | "remove-edge" | "update-settings";
  path: string;
  value: unknown;
  description: string;
}

export interface AiApplyRequest {
  automationId: string;
  diffs: AiDiff[];
}
