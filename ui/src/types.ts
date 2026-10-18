import type { Node } from "@xyflow/react";

import type { AutomationTarget, ActionTarget } from "../../src/core/types";
export type {
  AutomationTarget,
  ActionTarget,
  AutomationDefinition,
  AutomationSettings,
} from "../../src/core/types";
export type {
  AutomationNode as ApiAutomationNode,
  AutomationEdge as ApiAutomationEdge,
} from "../../src/core/types";
export { ACTION_TARGET_LABELS } from "../../src/core/types";

import type {
  RunResponse as CoreRunResponse,
  NodeExecutionResponse,
} from "../../src/core/api-types";
export type {
  SystemInfoResponse,
  AutomationResponse,
  NodeExecutionResponse,
  AgentResponse,
  AutomationVersionResponse,
  AiDiff,
  AiSettingsResponse,
} from "../../src/core/api-types";
export type {
  NodeItem,
  ArtifactRef,
  PortSchema,
} from "../../src/core/node-contract";
import type { PortSchema } from "../../src/core/node-contract";
export interface RunResponse extends CoreRunResponse {
  nodeExecutions?: NodeExecutionResponse[];
}

export interface PaletteNodeType {
  paramsSchema: Record<
    string,
    { type?: string; description?: string; default?: unknown }
  >;
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
  actionTarget?: ActionTarget;
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

export type { AiChatResponse } from "../../src/core/api-types";

export const CATEGORY_BORDER: Record<string, string> = {
  trigger: "border-blue-500/60",
  execution: "border-green-500/60",
  logic: "border-orange-500/60",
  state: "border-purple-500/60",
  vision: "border-pink-500/60",
  input: "border-teal-500/60",
};
