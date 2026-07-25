import { useEffect, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useAppStore } from "./store";
import { AutomationCanvas } from "./components/AutomationCanvas";
import { NodeEditor } from "./components/NodeEditor";
import { AutomationList } from "./components/AutomationList";
import { RunPanel } from "./components/RunPanel";
import {
  Play,
  Save,
  FlaskConical,
  Settings,
  MessageSquare,
} from "lucide-react";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function App() {
  const systemInfo = useAppStore((s) => s.systemInfo);
  const systemError = useAppStore((s) => s.systemError);
  const fetchSystemInfo = useAppStore((s) => s.fetchSystemInfo);
  const fetchAutomations = useAppStore((s) => s.fetchAutomations);
  const currentAutomationId = useAppStore((s) => s.currentAutomationId);
  const currentDefinition = useAppStore((s) => s.currentDefinition);
  const isDirty = useAppStore((s) => s.isDirty);
  const dryRun = useAppStore((s) => s.dryRun);
  const setDryRun = useAppStore((s) => s.setDryRun);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const saveAutomation = useAppStore((s) => s.saveAutomation);
  const runCurrentAutomation = useAppStore((s) => s.runCurrentAutomation);

  useEffect(() => {
    fetchSystemInfo();
    fetchAutomations();
  }, [fetchSystemInfo, fetchAutomations]);

  const handleSave = useCallback(() => {
    saveAutomation();
  }, [saveAutomation]);

  const handleRun = useCallback(() => {
    runCurrentAutomation();
  }, [runCurrentAutomation]);

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-100">
      <header className="flex h-11 items-center justify-between border-b border-gray-800 bg-gray-900 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-600 text-[10px] font-bold text-white">
            AP
          </div>
          <span className="text-sm font-semibold text-gray-200">
            Automation Platform
          </span>
          {currentDefinition && (
            <>
              <span className="text-gray-700">/</span>
              <span className="text-sm text-gray-300">
                {currentDefinition.name}
              </span>
              {isDirty && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                  unsaved
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentAutomationId && (
            <>
              <button
                onClick={() => setDryRun(!dryRun)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  dryRun
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-gray-800 text-gray-500 hover:text-gray-300"
                }`}
              >
                <FlaskConical className="h-3 w-3" />
                Dry Run
              </button>

              <button
                onClick={handleSave}
                disabled={!isDirty}
                className="flex items-center gap-1.5 rounded-md bg-gray-800 px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-40"
              >
                <Save className="h-3 w-3" />
                Save
              </button>

              <button
                onClick={handleRun}
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500"
              >
                <Play className="h-3 w-3" />
                Run
              </button>
            </>
          )}

          {systemInfo && (
            <span className="rounded-full bg-emerald-900/40 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400">
              {systemInfo.mode}
            </span>
          )}
        </div>
      </header>

      {dryRun && currentAutomationId && (
        <div className="flex items-center gap-2 border-b border-amber-700/30 bg-amber-950/30 px-4 py-1.5 text-xs text-amber-400">
          <FlaskConical className="h-3.5 w-3.5" />
          <span className="font-medium">Dry Run Mode</span>
          <span className="text-amber-500">
            Actions will be simulated, no side effects
          </span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-52 shrink-0 border-r border-gray-800">
          <AutomationList />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {currentAutomationId ? (
            <div className="flex flex-1 overflow-hidden">
              <ReactFlowProvider>
                <div className="flex-1 overflow-hidden">
                  <AutomationCanvas />
                </div>
              </ReactFlowProvider>

              {selectedNodeId && (
                <div className="w-64 shrink-0 border-l border-gray-800 bg-gray-950">
                  <NodeEditor />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mb-3 text-4xl text-gray-800">⚡</div>
                <h2 className="text-lg font-semibold text-gray-300">
                  Automation Platform
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Create or select an automation to get started
                </p>
                {systemError && (
                  <div className="mt-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-xs text-red-400">
                    API Error: {systemError}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-56 shrink-0 border-l border-gray-800 bg-gray-950">
          <RunPanel />
        </div>
      </div>

      <footer className="flex h-6 items-center justify-between border-t border-gray-800 bg-gray-900 px-4 text-[10px] text-gray-600">
        <div className="flex items-center gap-3">
          {systemInfo && <span>v{systemInfo.version}</span>}
          {systemInfo && <span>Uptime: {formatUptime(systemInfo.uptime)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-gray-600 hover:text-gray-400">
            <MessageSquare className="h-3 w-3" />
            AI Chat
          </button>
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-gray-600 hover:text-gray-400">
            <Settings className="h-3 w-3" />
            Settings
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
