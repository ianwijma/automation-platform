import type { Edge } from "@xyflow/react";
import type {
  ApiAutomationNode,
  ApiAutomationEdge,
  AutomationDefinition,
  FlowNode,
} from "./types";

let nextId = 1;
export function generateNodeId(): string {
  return `node_${Date.now()}_${nextId++}`;
}

export function generateEdgeId(
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
): string {
  return `edge_${source}_${sourcePort}_${target}_${targetPort}`;
}

export function apiNodeToFlowNode(node: ApiAutomationNode): FlowNode {
  const category = node.type.split(".")[0] ?? "";
  const resolvedCategory =
    category === "system" || category === "fs" || category === "http"
      ? "execution"
      : category === "error"
        ? "logic"
        : category;

  return {
    id: node.id,
    type: "automationNode",
    position: node.position,
    data: {
      nodeType: node.type,
      category: resolvedCategory,
      name: node.name,
      target: node.target,
      params: node.params,
      credentials: node.credentials,
      retry: node.retry,
      timeoutSec: node.timeoutSec,
      disabled: node.disabled,
      typeVersion: node.typeVersion,
    },
  };
}

export function apiEdgeToFlowEdge(edge: ApiAutomationEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourcePort,
    targetHandle: edge.targetPort,
    type: "smoothstep",
    animated: true,
  };
}

export function flowNodeToApiNode(node: FlowNode): ApiAutomationNode {
  return {
    id: node.id,
    type: node.data.nodeType,
    typeVersion: node.data.typeVersion,
    name: node.data.name,
    target: node.data.target as ApiAutomationNode["target"],
    params: node.data.params as Record<string, unknown>,
    credentials: node.data.credentials as ApiAutomationNode["credentials"],
    retry: node.data.retry as ApiAutomationNode["retry"],
    timeoutSec: node.data.timeoutSec as ApiAutomationNode["timeoutSec"],
    disabled: node.data.disabled,
    position: node.position,
  };
}

export function flowEdgeToApiEdge(edge: Edge): ApiAutomationEdge {
  return {
    id: edge.id,
    source: edge.source,
    sourcePort: edge.sourceHandle ?? "out",
    target: edge.target,
    targetPort: edge.targetHandle ?? "in",  };
}

export function definitionToFlow(
  def: AutomationDefinition,
): { nodes: FlowNode[]; edges: Edge[] } {
  return {
    nodes: def.nodes.map(apiNodeToFlowNode),
    edges: def.edges.map(apiEdgeToFlowEdge),
  };
}

export function flowToDefinition(
  nodes: FlowNode[],
  edges: Edge[],
  name: string,
  settings: AutomationDefinition["settings"],
): AutomationDefinition {
  return {
    schemaVersion: 1,
    name,
    settings,
    nodes: nodes.map(flowNodeToApiNode),
    edges: edges.map(flowEdgeToApiEdge),
  };
}

export function makeDefaultDefinition(name: string): AutomationDefinition {
  return {
    schemaVersion: 1,
    name,
    settings: {
      runTimeoutSec: 300,
      savePayloads: true,
      errorAutomationId: null,
    },
    nodes: [],
    edges: [],
  };
}
