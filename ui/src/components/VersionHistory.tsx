import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import type { AutomationVersionResponse } from "../types";
import { History, RotateCcw, Tag, X, Eye, Loader2 } from "lucide-react";

function LabelEditor({
  currentLabel,
  onSave,
}: {
  currentLabel: string | null;
  onSave: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentLabel ?? "");

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-800 hover:text-gray-300"
      >
        <Tag className="inline h-2.5 w-2.5" />
        {currentLabel ? "Edit" : "Add label"}
      </button>
    );
  }

  return (
    <div className="flex gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(value);
            setEditing(false);
          }
          if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        placeholder="Version label"
        className="w-28 rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
        autoFocus
      />
      <button
        onClick={() => {
          onSave(value);
          setEditing(false);
        }}
        className="rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] text-indigo-400 hover:bg-indigo-600/30"
      >
        Save
      </button>
      <button
        onClick={() => setEditing(false)}
        className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300"
      >
        Cancel
      </button>
    </div>
  );
}

function VersionRow({
  version,
  isPreviewed,
  onPreview,
  onRevert,
  onLabel,
}: {
  version: AutomationVersionResponse;
  isPreviewed: boolean;
  onPreview: (v: AutomationVersionResponse) => void;
  onRevert: (versionNo: number) => void;
  onLabel: (versionId: string, label: string) => void;
}) {
  const [reverting, setReverting] = useState(false);

  const date = new Date(version.createdAt);
  const timeStr = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleRevert = async () => {
    setReverting(true);
    onRevert(version.versionNo);
  };

  return (
    <div
      className={`rounded border px-3 py-2 ${
        isPreviewed
          ? "border-indigo-500/40 bg-indigo-500/5"
          : "border-gray-800 bg-gray-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-gray-300">
            v{version.versionNo}
          </span>
          {version.label && (
            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
              {version.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-600">{timeStr}</span>
      </div>

      <div className="mt-1 text-[10px] text-gray-500">
        {version.definition.nodes.length} nodes, {version.definition.edges.length} edges
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => onPreview(version)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              isPreviewed
                ? "bg-indigo-500/20 text-indigo-400"
                : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            <Eye className="h-2.5 w-2.5" />
            {isPreviewed ? "Previewing" : "Preview"}
          </button>
          <button
            onClick={handleRevert}
            disabled={reverting}
            className="flex items-center gap-1 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:text-gray-300 disabled:opacity-50"
          >
            {reverting ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <RotateCcw className="h-2.5 w-2.5" />
            )}
            Revert
          </button>
        </div>
        <LabelEditor
          currentLabel={version.label}
          onSave={(label) => onLabel(version.id, label)}
        />
      </div>
    </div>
  );
}

export function VersionHistory() {
  const versions = useAppStore((s) => s.versions);
  const previewVersion = useAppStore((s) => s.previewVersion);
  const fetchVersions = useAppStore((s) => s.fetchVersions);
  const setPreviewVersion = useAppStore((s) => s.setPreviewVersion);
  const clearPreviewVersion = useAppStore((s) => s.clearPreviewVersion);
  const revertToVersion = useAppStore((s) => s.revertToVersion);
  const labelVersion = useAppStore((s) => s.labelVersion);
  const setShowVersionHistory = useAppStore((s) => s.setShowVersionHistory);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  return (
    <div className="flex h-full flex-col bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-200">Version History</span>
          <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-500">
            {versions.length}
          </span>
        </div>
        <button
          onClick={() => setShowVersionHistory(false)}
          className="rounded px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-gray-300"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {previewVersion && (
        <div className="flex items-center justify-between border-b border-indigo-700/30 bg-indigo-950/30 px-3 py-1.5">
          <span className="text-[11px] font-medium text-indigo-400">
            Previewing v{previewVersion.versionNo}
          </span>
          <button
            onClick={clearPreviewVersion}
            className="rounded bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:text-gray-200"
          >
            Back to draft
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {versions.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              isPreviewed={previewVersion?.id === v.id}
              onPreview={setPreviewVersion}
              onRevert={revertToVersion}
              onLabel={labelVersion}
            />
          ))}
          {versions.length === 0 && (
            <div className="py-8 text-center text-[11px] text-gray-600">
              No versions yet. Save the automation to create a version.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
