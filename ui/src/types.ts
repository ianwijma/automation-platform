import type { Node } from "@xyflow/react";

export interface AutomationTarget {
  kind: "local" | "machine" | "tag" | "any";
  value?: string;
}

export interface ApiAutomationNode {
  id: string;
  type: string;
  typeVersion: number;
  name: string;
  target: AutomationTarget;
  params: Record<string, unknown>;
  credentials?: { type: string; name: string } | null;
  retry?: { attempts: number; backoffSec: number[] };
  timeoutSec?: number;
  disabled: boolean;
  position: { x: number; y: number };
}

export interface ApiAutomationEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

export interface AutomationSettings {
  runTimeoutSec: number;
  savePayloads: boolean;
  errorAutomationId: string | null;
}

export interface AutomationDefinition {
  schemaVersion: 1;
  name: string;
  settings: AutomationSettings;
  nodes: ApiAutomationNode[];
  edges: ApiAutomationEdge[];
}

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
  nodeExecutions?: NodeExecutionResponse[];
}

export interface NodeItem {
  json: Record<string, unknown>;
  binary?: Record<string, ArtifactRef>;
}

export interface ArtifactRef {
  $artifact: string;
  mime: string;
  size: number;
  name: string;
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

export interface PortSchema {
  name: string;
  type: "item" | "artifact";
}

export interface AgentResponse {
  id: string;
  name: string;
  isLocal: boolean;
  tags: string[];
  capabilities: Record<string, unknown>;
  version: string;
  status: "online" | "offline";
  lastSeenAt: string | null;
  enrolledAt: string;
}

export interface PaletteNodeType {
  type: string;
  displayName: string;
  category: string;
  icon: string;
  defaultParams: Record<string, unknown>;
  inputs: PortSchema[];
  outputs: PortSchema[];
}

export interface AutomationNodeData {
  [key: string]: unknown;
  nodeType: string;
  category: string;
  name: string;
  target: AutomationTarget;
  params: Record<string, unknown>;
  credentials?: { type: string; name: string } | null;
  retry?: { attempts: number; backoffSec: number[] };
  timeoutSec?: number;
  disabled: boolean;
  typeVersion: number;
}

export type FlowNode = Node<AutomationNodeData, "automationNode">;

export const CATEGORY_COLORS: Record<string, string> = {
  trigger: "#3b82f6",
  execution: "#22c55e",
  logic: "#f97316",
  state: "#a855f7",
  vision: "#ec4899",
  input: "#14b8a6",
};

export const CATEGORY_BG: Record<string, string> = {
  trigger: "bg-blue-500/10 border-blue-500/40",
  execution: "bg-green-500/10 border-green-500/40",
  logic: "bg-orange-500/10 border-orange-500/40",
  state: "bg-purple-500/10 border-purple-500/40",
  vision: "bg-pink-500/10 border-pink-500/40",
  input: "bg-teal-500/10 border-teal-500/40",
};

export const CATEGORY_TEXT: Record<string, string> = {
  trigger: "text-blue-400",
  execution: "text-green-400",
  logic: "text-orange-400",
  state: "text-purple-400",
  vision: "text-pink-400",
  input: "text-teal-400",
};

export interface AutomationVersionResponse {
  id: string;
  automationId: string;
  versionNo: number;
  definition: AutomationDefinition;
  label: string | null;
  createdAt: string;
}

export interface AiDiff {
  op: "add-node" | "remove-node" | "update-node-params" | "add-edge" | "remove-edge" | "update-settings";
  path: string;
  value: unknown;
  description: string;
}

export interface AiChatResponse {
  message: string;
  diffs?: AiDiff[];
}

export interface AiSettingsResponse {
  aiApiKey: string | null;
  aiModel: string;
  aiEndpoint: string | null;
  hasApiKey: boolean;
}

export const CATEGORY_BORDER: Record<string, string> = {
  trigger: "border-blue-500/60",
  execution: "border-green-500/60",
  logic: "border-orange-500/60",
  state: "border-purple-500/60",
  vision: "border-pink-500/60",
  input: "border-teal-500/60",
};
