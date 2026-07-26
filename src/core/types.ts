export interface AutomationTarget {
  kind: "local" | "machine" | "tag" | "any";
  value?: string;
}

export interface ActionTarget {
  kind: "screen" | "window" | "region" | "file" | "none";
  display?: string;
  monitor?: number;
  windowId?: string;
  windowTitle?: string;
  appId?: string;
  pid?: number;
  region?: { x: number; y: number; width: number; height: number };
}

export const ACTION_TARGET_LABELS: Record<ActionTarget["kind"], string> = {
  screen: "Screen",
  window: "Window",
  region: "Region",
  file: "File",
  none: "—",
};

export interface RetryPolicy {
  attempts: number;
  backoffSec: number[];
}

export interface AutomationNode {
  id: string;
  type: string;
  typeVersion: number;
  name: string;
  target: AutomationTarget;
  actionTarget?: ActionTarget;
  params: Record<string, unknown>;
  credentials?: { type: string; name: string } | null;
  retry?: RetryPolicy;
  timeoutSec?: number;
  disabled: boolean;
  position: { x: number; y: number };
}

export interface AutomationEdge {
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
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}
