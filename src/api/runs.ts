import type { Database } from "bun:sqlite";
import type {
  RunRecord,
  RunOptions,
  NodeExecutionRecord,
} from "../core/execution-engine.js";
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
    dryRun: run.dryRun,
    errorHandlerRunId: run.errorHandlerRunId,
    errorHandlerError: run.errorHandlerError,
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
    payloadArtifact: ne.payloadArtifact,
    input: ne.input,
    output: ne.output,
    pinned: ne.pinned,
    startedAt: ne.startedAt,
    durationMs: ne.durationMs,
    error: ne.error,
    outputs: ne.outputs,
    simulation: ne.simulation,
  };
}

export async function runAutomation(
  db: Database,
  dispatcher: AgentDispatcher,
  automationId: string,
  options: RunOptions,
  errorChain: ReadonlySet<string> = new Set(),
): Promise<RunRecord | null> {
  const row = db
    .query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?")
    .get(automationId);
  if (!row) return null;

  let definitionJson: string | null = null;
  let versionId: string | null = null;

  if (options.mode === "trigger" && row.active_version_id) {
    const version = db
      .query<
        VersionRow,
        [string]
      >("SELECT * FROM automation_versions WHERE id = ?")
      .get(row.active_version_id);
    if (version) {
      definitionJson = version.definition_json;
      versionId = version.id;
    }
  }

  if (options.mode === "trigger" && !definitionJson) return null;
  if (!definitionJson && row.draft_json) {
    const latestVersion = db
      .query<
        VersionRow,
        [string]
      >("SELECT * FROM automation_versions WHERE automation_id = ? ORDER BY version_no DESC LIMIT 1")
      .get(automationId);
    definitionJson = row.draft_json;
    versionId = latestVersion?.id ?? "draft";
  }

  if (!definitionJson) return null;

  const definition = JSON.parse(definitionJson);
  const engine = new ExecutionEngine(dispatcher);

  const run = await engine.execute(
    definition,
    automationId,
    versionId ?? "unknown",
    options,
  );
  const handlerId = definition.settings.errorAutomationId;
  if (run.status === "error" && !run.dryRun && handlerId) {
    try {
      const chain = new Set([...errorChain, automationId]);
      if (chain.has(handlerId) || chain.size >= 8)
        throw new Error("Error automation cycle or depth limit reached");
      const handler = db
        .query<
          { definition_json: string },
          [string]
        >("SELECT v.definition_json FROM automations a JOIN automation_versions v ON v.id=a.active_version_id WHERE a.id=?")
        .get(handlerId);
      if (!handler) throw new Error("Error automation must be active");
      const triggers = (
        JSON.parse(
          handler.definition_json,
        ) as import("../core/types.js").AutomationDefinition
      ).nodes.filter((n) => !n.disabled && n.type === "trigger.manual");
      if (triggers.length !== 1)
        throw new Error(
          "Error automation must have exactly one Manual Trigger to receive the error event",
        );
      const child = await runAutomation(
        db,
        dispatcher,
        handlerId,
        {
          mode: "trigger",
          triggerNodeId: triggers[0].id,
          triggerData: [
            { json: { failedRunId: run.id, automationId, error: run.error } },
          ],
        },
        chain,
      );
      run.errorHandlerRunId = child?.id;
    } catch (error) {
      run.errorHandlerError =
        error instanceof Error ? error.message : String(error);
    }
    dispatcher.saveRun(run);
  }
  return run;
}

export function getRun(
  dispatcher: AgentDispatcher,
  runId: string,
): (RunResponse & { nodeExecutions: NodeExecutionResponse[] }) | null {
  const run = dispatcher.getRun(runId);
  if (!run) return null;

  return {
    ...runRecordToResponse(run),
    nodeExecutions: run.nodeExecutions.map(nodeExecToResponse),
  };
}

export function listRuns(
  dispatcher: AgentDispatcher,
  automationId?: string,
): RunResponse[] {
  const allRuns = dispatcher.getAllRuns();
  const filtered = automationId
    ? allRuns.filter((r) => r.automationId === automationId)
    : allRuns;

  return filtered.map(runRecordToResponse);
}
