import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import type { RunResponse, NodeExecutionResponse } from "../types";
import { DataPreview } from "./DataPreview";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Pause,
  Ban,
  AlertTriangle,
} from "lucide-react";

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string; bg: string }
> = {
  queued: { icon: Clock, color: "text-gray-400", bg: "bg-gray-800" },
  running: { icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10" },
  success: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
  error: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  interrupted: { icon: Pause, color: "text-amber-400", bg: "bg-amber-500/10" },
  cancelled: { icon: Ban, color: "text-gray-500", bg: "bg-gray-800" },
};

const NODE_STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircle2; color: string }
> = {
  success: { icon: CheckCircle2, color: "text-green-400" },
  error: { icon: XCircle, color: "text-red-400" },
  timeout: { icon: Clock, color: "text-amber-400" },
  cancelled: { icon: Ban, color: "text-gray-500" },
  interrupted: { icon: AlertTriangle, color: "text-amber-400" },
};

const DEFAULT_STATUS = { icon: Clock, color: "text-gray-400", bg: "bg-gray-800" };
const DEFAULT_NODE_STATUS = { icon: Clock, color: "text-gray-400" };

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function RunItem({
  run,
  selected,
  onClick,
}: {
  run: RunResponse;
  selected: boolean;
  onClick: () => void;
}) {
  const config = STATUS_CONFIG[run.status] ?? DEFAULT_STATUS;
  const Icon = config.icon;
  const spinning = run.status === "running";

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        selected ? "bg-indigo-500/15 text-indigo-300" : "text-gray-400 hover:bg-gray-800/60"
      }`}
    >
      <Icon className={`h-3 w-3 ${config.color} ${spinning ? "animate-spin" : ""}`} />
      <div className="flex-1">
        <div className="truncate font-medium">
          {run.mode === "dry" ? "Dry run" : run.mode}
        </div>
        <div className="text-[10px] text-gray-600">
          {new Date(run.startedAt).toLocaleTimeString()}
        </div>
      </div>
      <span className={`text-[10px] font-medium ${config.color}`}>{run.status}</span>
    </button>
  );
}

function NodeExecutionRow({
  exec,
  selected,
  onClick,
}: {
  exec: NodeExecutionResponse;
  selected: boolean;
  onClick: () => void;
}) {
  const config = NODE_STATUS_CONFIG[exec.status] ?? DEFAULT_NODE_STATUS;
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-left transition-colors ${
        selected ? "bg-indigo-500/15 text-indigo-300" : "text-gray-400 hover:bg-gray-800/60"
      }`}
    >
      <Icon className={`h-3 w-3 ${config.color}`} />
      <span className="flex-1 truncate text-gray-300">{exec.nodeId}</span>
      <span className="text-gray-600">{formatDuration(exec.durationMs)}</span>
      {exec.simulated && (
        <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-400">
          sim
        </span>
      )}
      {exec.pinned && (
        <span className="rounded bg-blue-500/20 px-1 py-0.5 text-[9px] text-blue-400">
          cached
        </span>
      )}
      {exec.error && (
        <span className="max-w-[120px] truncate text-red-400" title={exec.error}>
          {exec.error}
        </span>
      )}
    </button>
  );
}

export function RunPanel() {
  const runs = useAppStore((s) => s.runs);
  const currentRunId = useAppStore((s) => s.currentRunId);
  const nodeExecutions = useAppStore((s) => s.nodeExecutions);
  const setCurrentRunId = useAppStore((s) => s.setCurrentRunId);
  const fetchNodeExecutions = useAppStore((s) => s.fetchNodeExecutions);
  const fetchRuns = useAppStore((s) => s.fetchRuns);
  const currentAutomationId = useAppStore((s) => s.currentAutomationId);

  const selectedNodeExecId = useAppStore((s) => s.selectedNodeExecId);
  const setSelectedNodeExecId = useAppStore((s) => s.setSelectedNodeExecId);
  const [pinnedPreview, setPinnedPreview] = useState(false);

  const currentRun = runs.find((r) => r.id === currentRunId);
  const currentExecutions = currentRunId
    ? nodeExecutions[currentRunId] ?? []
    : [];

  const selectedExec = selectedNodeExecId
    ? currentExecutions.find((e) => e.id === selectedNodeExecId)
    : null;

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns, currentAutomationId]);

  const handleSelectRun = async (runId: string) => {
    setCurrentRunId(runId);
    setSelectedNodeExecId(null);
    await fetchNodeExecutions(runId);
  };

  const handleSelectNodeExec = (execId: string) => {
    setSelectedNodeExecId(selectedNodeExecId === execId ? null : execId);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Runs
        </span>
      </div>

      <div className="max-h-[200px] overflow-y-auto p-1">
        {runs.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-gray-600">
            No runs yet
          </div>
        )}
        {runs.map((run) => (
          <RunItem
            key={run.id}
            run={run}
            selected={run.id === currentRunId}
            onClick={() => handleSelectRun(run.id)}
          />
        ))}
      </div>

      {currentRun && (
        <>
          <div className="border-t border-gray-800 px-3 py-2">
            <div className="text-xs font-medium text-gray-300">
              Run Details
            </div>
            <div className="mt-1 flex gap-3 text-[10px] text-gray-500">
              <span>Mode: {currentRun.mode}</span>
              <span>Status: {currentRun.status}</span>
              {currentRun.finishedAt && (
                <span>
                  Duration:{" "}
                  {formatDuration(
                    new Date(currentRun.finishedAt).getTime() -
                      new Date(currentRun.startedAt).getTime(),
                  )}
                </span>
              )}
            </div>
            {currentRun.error && (
              <div className="mt-1 rounded bg-red-950/30 px-2 py-1 text-[11px] text-red-400">
                {currentRun.error}
              </div>
            )}
          </div>

          <div className="border-t border-gray-800 px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Node Executions
            </span>
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {currentExecutions.length === 0 && (
              <div className="px-3 py-2 text-center text-[11px] text-gray-600">
                No execution data
              </div>
            )}
            {currentExecutions.map((exec) => (
              <NodeExecutionRow
                key={exec.id}
                exec={exec}
                selected={exec.id === selectedNodeExecId}
                onClick={() => handleSelectNodeExec(exec.id)}
              />
            ))}
          </div>

          {selectedExec && (
            <>
              <div className="border-t border-gray-800 px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  Data Preview — {selectedExec.nodeId}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <DataPreview
                  input={selectedExec.input}
                  output={selectedExec.output}
                  pinned={pinnedPreview}
                  onTogglePin={() => setPinnedPreview(!pinnedPreview)}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
