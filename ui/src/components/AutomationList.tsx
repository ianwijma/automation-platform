import { useState } from "react";
import { useAppStore } from "../store";
import { Plus, Trash2, Zap, ZapOff } from "lucide-react";

export function AutomationList() {
  const automations = useAppStore((s) => s.automations);
  const currentAutomationId = useAppStore((s) => s.currentAutomationId);
  const selectAutomation = useAppStore((s) => s.selectAutomation);
  const createAutomation = useAppStore((s) => s.createAutomation);
  const deleteAutomation = useAppStore((s) => s.deleteAutomation);

  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim() || "Untitled Automation";
    await createAutomation(name);
    setNewName("");
    setShowCreate(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape") setShowCreate(false);
  };

  return (
    <div className="flex h-full flex-col bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
          Automations
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 rounded bg-indigo-500/20 px-2 py-1 text-[11px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/30"
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {showCreate && (
        <div className="border-b border-gray-800 px-3 py-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Automation name"
            autoFocus
            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-indigo-500"
          />
          <div className="mt-1.5 flex gap-1">
            <button
              onClick={handleCreate}
              className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded bg-gray-800 px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1">
        {automations.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-gray-600">
            No automations yet
          </div>
        )}
        {automations.map((auto) => (
          <div
            key={auto.id}
            className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer ${
              currentAutomationId === auto.id
                ? "bg-indigo-500/15 text-indigo-300"
                : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-200"
            }`}
            onClick={() => selectAutomation(auto.id)}
          >
            {auto.activeVersionId ? (
              <Zap className="h-3 w-3 text-green-400" />
            ) : (
              <ZapOff className="h-3 w-3 text-gray-600" />
            )}
            <span className="flex-1 truncate">{auto.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteAutomation(auto.id);
              }}
              className="invisible rounded p-0.5 text-gray-600 transition-colors hover:text-red-400 group-hover:visible"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
