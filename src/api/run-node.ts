import type { Database } from "bun:sqlite";
import type {
  RunRecord,
  NodeExecutionRecord,
  RunOptions,
} from "../core/execution-engine.js";
import type { NodeItem } from "../core/node-contract.js";
import type { AgentDispatcher } from "../agent/dispatcher.js";
import type { AutomationDefinition } from "../core/types.js";
import { ExecutionEngine } from "../core/execution-engine.js";

interface AutomationRow {
  id: string;
  name: string;
  active_version_id: string | null;
  draft_json: string | null;
  settings_json: string | null;
  created_at: string;
  updated_at: string;
}

function getUpstreamNodeIds(
  definition: AutomationDefinition,
  targetNodeId: string,
): Set<string> {
  const visited = new Set<string>();
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of definition.edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }

  visited.delete(targetNodeId);
  return visited;
}

function findTriggerNodes(definition: AutomationDefinition): string[] {
  return definition.nodes
    .filter((n) => n.type.startsWith("trigger."))
    .map((n) => n.id);
}

function buildPinDataFromRuns(
  dispatcher: AgentDispatcher,
  automationId: string,
  upstreamNodeIds: Set<string>,
  definition: AutomationDefinition,
): Record<string, NodeItem[]> | null {
  const allRuns = dispatcher
    .getAllRuns()
    .filter(
      (r) =>
        r.automationId === automationId &&
        JSON.stringify(r.definition) === JSON.stringify(definition),
    )
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

  for (const saved of allRuns) {
    const run = dispatcher.getRun(saved.id, true)!;
    const pinData: Record<string, NodeItem[]> = {};
    let allCovered = true;

    for (const nodeId of upstreamNodeIds) {
      const ne = run.nodeExecutions.find(
        (n) => n.nodeId === nodeId && n.output,
      );
      if (ne && ne.output) {
        pinData[nodeId] = ne.output;
      } else {
        allCovered = false;
        break;
      }
    }

    if (allCovered) return pinData;
  }

  return null;
}

export interface RunNodeOptions {
  runId?: string;
  fresh?: boolean;
  dryRun?: boolean;
  inputData?: NodeItem[];
}

export async function runNode(
  db: Database,
  dispatcher: AgentDispatcher,
  automationId: string,
  nodeId: string,
  opts: RunNodeOptions = {},
): Promise<RunRecord | null> {
  const autoRow = db
    .query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?")
    .get(automationId);
  if (!autoRow) return null;

  const definitionJson = autoRow.draft_json;
  if (!definitionJson) return null;

  const definition: AutomationDefinition = JSON.parse(definitionJson);
  const targetNode = definition.nodes.find((n) => n.id === nodeId);
  if (!targetNode) return null;

  const upstreamNodeIds = getUpstreamNodeIds(definition, nodeId);

  let pinData: Record<string, NodeItem[]> = {};
  let nodeScope: "to" | "single";

  if (opts.inputData) {
    nodeScope = "single";
  } else if (!opts.fresh && upstreamNodeIds.size > 0) {
    const cachedPin = buildPinDataFromRuns(
      dispatcher,
      automationId,
      upstreamNodeIds,
      definition,
    );
    if (cachedPin) {
      Object.assign(pinData, cachedPin);
      nodeScope = "single";
    } else {
      nodeScope = "to";
    }
  } else if (upstreamNodeIds.size === 0) {
    nodeScope = "single";
  } else {
    nodeScope = "to";
  }

  const engine = new ExecutionEngine(dispatcher);
  const options: RunOptions = {
    mode: "partial",
    runId: opts.runId,
    dryRun: opts.dryRun,
    inputData: opts.inputData,
    fromNodeId: nodeId,
    nodeScope,
    pinData: Object.keys(pinData).length > 0 ? pinData : undefined,
  };

  return engine.execute(definition, automationId, "draft", options);
}
