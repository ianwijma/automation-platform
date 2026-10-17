import type { Database } from "bun:sqlite";
import type {
  RunRecord,
  NodeExecutionRecord,
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

interface VersionRow {
  id: string;
  automation_id: string;
  version_no: number;
  definition_json: string;
  label: string | null;
  created_at: string;
}

export async function rerunFromNode(
  db: Database,
  dispatcher: AgentDispatcher,
  originalRunId: string,
  fromNodeId: string,
  runId?: string,
): Promise<RunRecord | null> {
  const originalRun = dispatcher.getRun(originalRunId, true);
  if (!originalRun) return null;

  const previousNodeExec = originalRun.nodeExecutions.findLast(
    (ne) => ne.nodeId === fromNodeId,
  );
  if (!previousNodeExec) return null;

  const autoRow = db
    .query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?")
    .get(originalRun.automationId);
  if (!autoRow) return null;

  let definitionJson: string | null = null;
  let versionId: string | null = originalRun.versionId;

  if (originalRun.versionId && originalRun.versionId !== "draft") {
    const version = db
      .query<
        VersionRow,
        [string]
      >("SELECT * FROM automation_versions WHERE id = ?")
      .get(originalRun.versionId);
    if (version) definitionJson = version.definition_json;
  }

  if (!definitionJson && autoRow.draft_json) {
    definitionJson = autoRow.draft_json;
  }

  if (!definitionJson) return null;

  const definition: AutomationDefinition =
    originalRun.definition ?? JSON.parse(definitionJson);

  const pinData: Record<string, NodeItem[]> = {};
  const upstreamNodeIds = getUpstreamNodeIds(definition, fromNodeId);
  for (const ne of originalRun.nodeExecutions) {
    if (upstreamNodeIds.has(ne.nodeId) && ne.output) {
      pinData[ne.nodeId] = ne.output;
    }
  }

  if (previousNodeExec.input === null)
    throw new Error("Input payloads were not saved for this run");
  const engine = new ExecutionEngine(dispatcher);
  return engine.execute(
    definition,
    originalRun.automationId,
    versionId ?? "unknown",
    {
      mode: "partial",
      runId,
      fromNodeId,
      inputData: previousNodeExec.input,
      dryRun: originalRun.dryRun || originalRun.mode === "dry",
      pinData,
    },
  );
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
