import type { Database } from "bun:sqlite";
import type { RunRecord, RunOptions, NodeExecutionRecord } from "../core/execution-engine.js";
import type { AgentDispatcher } from "../agent/dispatcher.js";
import type { RunResponse, NodeExecutionResponse } from "../core/api-types.js";
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

function runRecordToResponse(run: RunRecord): RunResponse {
  return {
    id: run.id,
    automationId: run.automationId,
    versionId: run.versionId,
    mode: run.mode as RunResponse["mode"],
    status: run.status,
    trigger: null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: run.error,
  };
}

function nodeExecToResponse(ne: NodeExecutionRecord): NodeExecutionResponse {
  return {
    id: ne.id,
    runId: ne.runId,
    nodeId: ne.nodeId,
    agentId: ne.agentId,
    status: ne.status as NodeExecutionResponse["status"],
    attempt: ne.attempt,
    simulated: ne.simulated,
    input: ne.input,
    output: ne.output,
    pinned: ne.pinned,
    startedAt: ne.startedAt,
    durationMs: ne.durationMs,
    error: ne.error,
  };
}

export async function runAutomation(
  db: Database,
  dispatcher: AgentDispatcher,
  automationId: string,
  options: RunOptions,
): Promise<RunRecord | null> {
  const row = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(automationId);
  if (!row) return null;

  let definitionJson: string | null = null;
  let versionId: string | null = null;

  if (row.active_version_id) {
    const version = db.query<VersionRow, [string]>("SELECT * FROM automation_versions WHERE id = ?").get(row.active_version_id);
    if (version) {
      definitionJson = version.definition_json;
      versionId = version.id;
    }
  }

  if (!definitionJson && row.draft_json) {
    const latestVersion = db.query<VersionRow, [string]>(
      "SELECT * FROM automation_versions WHERE automation_id = ? ORDER BY version_no DESC LIMIT 1",
    ).get(automationId);
    definitionJson = row.draft_json;
    versionId = latestVersion?.id ?? "draft";
  }

  if (!definitionJson) return null;

  const definition = JSON.parse(definitionJson);
  const engine = new ExecutionEngine(dispatcher);

  return engine.execute(definition, automationId, versionId ?? "unknown", options);
}

export function getRun(dispatcher: AgentDispatcher, runId: string): (RunResponse & { nodeExecutions: NodeExecutionResponse[] }) | null {
  const run = dispatcher.getRun(runId);
  if (!run) return null;

  return {
    ...runRecordToResponse(run),
    nodeExecutions: run.nodeExecutions.map(nodeExecToResponse),
  };
}

export function listRuns(dispatcher: AgentDispatcher, automationId?: string): RunResponse[] {
  const allRuns = dispatcher.getAllRuns();
  const filtered = automationId
    ? allRuns.filter((r) => r.automationId === automationId)
    : allRuns;

  return filtered.map(runRecordToResponse);
}
