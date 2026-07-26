import { useState } from "react";
import { useAppStore } from "../store";
import type { AutomationTarget, ActionTarget } from "../types";
import { CATEGORY_COLORS, CATEGORY_TEXT } from "../types";
import { findPaletteNode } from "./NodePalette";
import { Trash2, Power, Monitor, Server, Tag, Zap, Play, Loader2, RotateCcw, ChevronDown, ChevronRight, ScreenShare, AppWindow, Square, File } from "lucide-react";

const TARGET_OPTIONS: { kind: AutomationTarget["kind"]; icon: typeof Monitor; label: string }[] = [
  { kind: "local", icon: Monitor, label: "Local" },
  { kind: "machine", icon: Server, label: "Machine" },
  { kind: "tag", icon: Tag, label: "Tag" },
  { kind: "any", icon: Zap, label: "Any" },
];

const ACTION_OPTIONS: { kind: ActionTarget["kind"]; icon: typeof ScreenShare; label: string }[] = [
  { kind: "none", icon: Square, label: "N/A" },
  { kind: "screen", icon: ScreenShare, label: "Screen" },
  { kind: "window", icon: AppWindow, label: "Window" },
  { kind: "region", icon: Square, label: "Region" },
  { kind: "file", icon: File, label: "File" },
];

function ExpressionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const strVal = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const isExpression = strVal.startsWith("{{") && strVal.endsWith("}}");
  const [exprMode, setExprMode] = useState(isExpression);

  const toggle = () => {
    if (!exprMode) {
      onChange(`{{ ${strVal} }}`);
      setExprMode(true);
    } else {
      const inner = strVal.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
      onChange(inner);
      setExprMode(false);
    }
  };

  const handleChange = (v: string) => {
    if (exprMode) {
      onChange(`{{ ${v} }}`);
    } else {
      onChange(v);
    }
  };

  const displayValue = exprMode
    ? strVal.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "")
    : strVal;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-gray-400">{label}</label>
        <button
          onClick={toggle}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            exprMode
              ? "bg-amber-500/20 text-amber-400"
              : "bg-gray-800 text-gray-500 hover:text-gray-300"
          }`}
        >
          {exprMode ? "expr" : "val"}
        </button>
      </div>
      <input
        type="text"
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        className={`w-full rounded border bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none transition-colors ${
          exprMode
            ? "border-amber-500/40 focus:border-amber-400"
            : "border-gray-700 focus:border-gray-500"
        }`}
      />
    </div>
  );
}

function ParamsForm({
  params,
  onChange,
}: {
  params: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const entries = Object.entries(params);

  if (entries.length === 0) {
    return (
      <div className="py-2 text-center text-[11px] text-gray-600">
        No parameters
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map(([key, value]) => {
        if (typeof value === "number") {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-400">{key}</label>
              <input
                type="number"
                value={value}
                onChange={(e) => onChange(key, Number(e.target.value))}
                className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
              />
            </div>
          );
        }

        if (typeof value === "boolean") {
          return (
            <div key={key} className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-gray-400">{key}</label>
              <button
                onClick={() => onChange(key, !value)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  value
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-gray-800 text-gray-500"
                }`}
              >
                {value ? "true" : "false"}
              </button>
            </div>
          );
        }

        if (typeof value === "object" && value !== null) {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-400">{key}</label>
              <textarea
                value={JSON.stringify(value, null, 2)}
                onChange={(e) => {
                  try {
                    onChange(key, JSON.parse(e.target.value));
                  } catch {
                    /* invalid JSON, keep as string temporarily */
                  }
                }}
                rows={3}
                className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 font-mono text-[11px] text-gray-200 outline-none focus:border-gray-500"
              />
            </div>
          );
        }

        return (
          <ExpressionInput
            key={key}
            label={key}
            value={value}
            onChange={(v) => onChange(key, v)}
          />
        );
      })}
    </div>
  );
}

export function NodeEditor() {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const rfNodes = useAppStore((s) => s.rfNodes);
  const updateNodeData = useAppStore((s) => s.updateNodeData);
  const removeNode = useAppStore((s) => s.removeNode);
  const executeNode = useAppStore((s) => s.executeNode);
  const [isExecutingNode, setIsExecutingNode] = useState(false);
  const [showTestInput, setShowTestInput] = useState(false);
  const [testInputJson, setTestInputJson] = useState('[{ "json": {} }]');

  const selectedNode = rfNodes.find((n) => n.id === selectedNodeId);
  if (!selectedNode) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-600">
        Select a node to edit
      </div>
    );
  }

  const data = selectedNode.data;
  const paletteNode = findPaletteNode(data.nodeType as string);
  const category = data.category as string;
  const color = CATEGORY_COLORS[category] ?? "#6b7280";
  const textClass = CATEGORY_TEXT[category] ?? "text-gray-400";

  const handleNameChange = (name: string) => {
    updateNodeData(selectedNode.id, { name });
  };

  const handleTargetKindChange = (kind: AutomationTarget["kind"]) => {
    const newTarget: AutomationTarget = { kind };
    if (kind === "machine") newTarget.value = "";
    if (kind === "tag") newTarget.value = "";
    updateNodeData(selectedNode.id, { target: newTarget });
  };

  const handleTargetValueChange = (value: string) => {
    updateNodeData(selectedNode.id, {
      target: { ...(data.target as AutomationTarget), value },
    });
  };

  const handleActionTargetKindChange = (kind: ActionTarget["kind"]) => {
    const newActionTarget: ActionTarget = { kind };
    if (kind === "screen") newActionTarget.display = "current";
    if (kind === "window") { newActionTarget.windowTitle = ""; newActionTarget.appId = ""; }
    if (kind === "region") newActionTarget.region = { x: 0, y: 0, width: 800, height: 600 };
    if (kind === "none") updateNodeData(selectedNode.id, { actionTarget: undefined });
    else updateNodeData(selectedNode.id, { actionTarget: newActionTarget });
  };

  const handleActionTargetFieldChange = (field: string, value: unknown) => {
    const current = (data.actionTarget as ActionTarget | undefined) ?? { kind: "screen" };
    updateNodeData(selectedNode.id, { actionTarget: { ...current, [field]: value } });
  };

  const showActionTarget = ["vision", "input"].includes(category);

  const handleParamChange = (key: string, value: unknown) => {
    updateNodeData(selectedNode.id, {
      params: { ...(data.params as Record<string, unknown>), [key]: value },
    });
  };

  const handleDisabledToggle = () => {
    updateNodeData(selectedNode.id, { disabled: !(data.disabled as boolean) });
  };

  const handleDelete = () => {
    removeNode(selectedNode.id);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-gray-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className={`text-xs font-semibold uppercase ${textClass}`}>
            {category}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-gray-500">
          {data.nodeType as string}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-400">Name</label>
          <input
            type="text"
            value={data.name as string}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-gray-400">Runs on</label>
          <div className="flex gap-1">
            {TARGET_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const currentKind = (data.target as AutomationTarget).kind;
              return (
                <button
                  key={opt.kind}
                  onClick={() => handleTargetKindChange(opt.kind)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    currentKind === opt.kind
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-gray-800 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          {((data.target as AutomationTarget).kind === "machine" ||
            (data.target as AutomationTarget).kind === "tag") && (
            <input
              type="text"
              value={(data.target as AutomationTarget).value ?? ""}
              onChange={(e) => handleTargetValueChange(e.target.value)}
              placeholder={
                (data.target as AutomationTarget).kind === "machine"
                  ? "Machine name"
                  : "Tag name"
              }
              className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
            />
          )}
        </div>

        {showActionTarget && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-indigo-400">Acts on</label>
            <div className="flex gap-1 flex-wrap">
              {ACTION_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const currentKind = (data.actionTarget as ActionTarget | undefined)?.kind ?? "none";
                return (
                  <button
                    key={opt.kind}
                    onClick={() => handleActionTargetKindChange(opt.kind)}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                      currentKind === opt.kind
                        ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                        : "bg-gray-800 text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {data.actionTarget && (data.actionTarget as ActionTarget).kind !== "none" && (
              <div className="mt-1 flex flex-col gap-1.5">
                {(data.actionTarget as ActionTarget).kind === "screen" && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500">Display</label>
                      <input
                        type="text"
                        value={(data.actionTarget as ActionTarget).display ?? "current"}
                        onChange={(e) => handleActionTargetFieldChange("display", e.target.value)}
                        placeholder=":0 or DP-1 or current"
                        className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500">Monitor #</label>
                      <input
                        type="number"
                        value={(data.actionTarget as ActionTarget).monitor ?? 0}
                        onChange={(e) => handleActionTargetFieldChange("monitor", Number(e.target.value))}
                        className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                      />
                    </div>
                  </>
                )}
                {(data.actionTarget as ActionTarget).kind === "window" && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500">Application</label>
                      <input
                        type="text"
                        value={(data.actionTarget as ActionTarget).appId ?? ""}
                        onChange={(e) => handleActionTargetFieldChange("appId", e.target.value)}
                        placeholder="firefox, org.gnome.Terminal, etc."
                        className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500">Window title (regex)</label>
                      <input
                        type="text"
                        value={(data.actionTarget as ActionTarget).windowTitle ?? ""}
                        onChange={(e) => handleActionTargetFieldChange("windowTitle", e.target.value)}
                        placeholder="e.g. Firefox.*GitHub"
                        className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500">Window ID (hex)</label>
                      <input
                        type="text"
                        value={(data.actionTarget as ActionTarget).windowId ?? ""}
                        onChange={(e) => handleActionTargetFieldChange("windowId", e.target.value)}
                        placeholder="0x05600004"
                        className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500">Process ID</label>
                      <input
                        type="number"
                        value={(data.actionTarget as ActionTarget).pid ?? 0}
                        onChange={(e) => handleActionTargetFieldChange("pid", Number(e.target.value))}
                        className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                      />
                    </div>
                  </>
                )}
                {(data.actionTarget as ActionTarget).kind === "region" && (
                  <>
                    {(["x", "y", "width", "height"] as const).map((dim) => (
                      <div key={dim} className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 capitalize">{dim}</label>
                        <input
                          type="number"
                          value={(data.actionTarget as ActionTarget).region?.[dim] ?? 0}
                          onChange={(e) =>
                            handleActionTargetFieldChange("region", {
                              ...((data.actionTarget as ActionTarget).region ?? { x: 0, y: 0, width: 800, height: 600 }),
                              [dim]: Number(e.target.value),
                            })
                          }
                          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-800 pt-2">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Parameters
          </div>
          <ParamsForm
            params={data.params as Record<string, unknown>}
            onChange={handleParamChange}
          />
        </div>

        <div className="border-t border-gray-800 pt-2">
          <button
            onClick={() => setShowTestInput(!showTestInput)}
            className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300"
          >
            {showTestInput ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Test Input
          </button>
          {showTestInput && (
            <div className="mt-2 flex flex-col gap-1">
              <textarea
                value={testInputJson}
                onChange={(e) => setTestInputJson(e.target.value)}
                rows={3}
                placeholder='[{ "json": { "key": "value" } }]'
                className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 font-mono text-[11px] text-gray-200 outline-none focus:border-gray-500"
              />
              <div className="text-[9px] text-gray-600">
                JSON array of items to feed into trigger nodes when executing
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-800 pt-2">
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                setIsExecutingNode(true);
                try {
                  let inputData;
                  try { inputData = JSON.parse(testInputJson); } catch { inputData = undefined; }
                  await executeNode(selectedNode.id, false, inputData);
                } finally {
                  setIsExecutingNode(false);
                }
              }}
              disabled={isExecutingNode}
              className="flex items-center gap-1 rounded bg-green-600/20 px-2 py-1 text-[11px] font-medium text-green-400 transition-colors hover:bg-green-600/30 disabled:opacity-50"
              title="Execute this node (uses cached inputs from last run)"
            >
              {isExecutingNode ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Execute
            </button>
            <button
              onClick={async () => {
                setIsExecutingNode(true);
                try {
                  let inputData;
                  try { inputData = JSON.parse(testInputJson); } catch { inputData = undefined; }
                  await executeNode(selectedNode.id, true, inputData);
                } finally {
                  setIsExecutingNode(false);
                }
              }}
              disabled={isExecutingNode}
              className="rounded p-1 text-gray-500 transition-colors hover:text-green-400 disabled:opacity-50"
              title="Execute with fresh inputs (re-runs upstream nodes)"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDisabledToggle}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                data.disabled
                  ? "bg-red-500/20 text-red-400"
                  : "bg-gray-800 text-gray-500 hover:text-gray-300"
              }`}
            >
              <Power className="h-3 w-3" />
              {data.disabled ? "Disabled" : "Enabled"}
            </button>

            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </div>

        {paletteNode && (
          <div className="border-t border-gray-800 pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Ports
            </div>
            <div className="flex flex-col gap-1">
              {paletteNode.inputs.length > 0 && (
                <div className="text-[11px] text-gray-500">
                  Inputs: {paletteNode.inputs.map((p) => p.name).join(", ")}
                </div>
              )}
              {paletteNode.outputs.length > 0 && (
                <div className="text-[11px] text-gray-500">
                  Outputs: {paletteNode.outputs.map((p) => p.name).join(", ")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
