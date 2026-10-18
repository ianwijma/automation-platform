import { fetchJson } from "../hooks/useApi";
import type { CredentialMetadata } from "./WorkspaceSettings";
import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../store";
import type { AutomationTarget, ActionTarget } from "../types";
import { CATEGORY_COLORS, CATEGORY_TEXT } from "../types";
import { findPaletteNode } from "./NodePalette";
import {
  Trash2,
  Power,
  Monitor,
  Server,
  Tag,
  Zap,
  Play,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  ScreenShare,
  AppWindow,
  Square,
  File,
} from "lucide-react";

const TARGET_OPTIONS: {
  kind: AutomationTarget["kind"];
  icon: typeof Monitor;
  label: string;
}[] = [
  { kind: "local", icon: Monitor, label: "Local" },
  { kind: "machine", icon: Server, label: "Machine" },
  { kind: "tag", icon: Tag, label: "Tag" },
  { kind: "any", icon: Zap, label: "Any" },
];

const ACTION_OPTIONS: {
  kind: ActionTarget["kind"];
  icon: typeof ScreenShare;
  label: string;
}[] = [
  { kind: "none", icon: Square, label: "N/A" },
  { kind: "screen", icon: ScreenShare, label: "Screen" },
  { kind: "window", icon: AppWindow, label: "Window" },
  { kind: "region", icon: Square, label: "Region" },
  { kind: "file", icon: File, label: "File" },
];

function ParamField({
  nodeId,
  name,
  value,
  schema,
  onChange,
}: {
  nodeId: string;
  name: string;
  value: unknown;
  schema: { type?: string; description?: string };
  onChange(value: unknown): void;
}) {
  const complex = schema.type === "object" || schema.type === "array";
  const draftKey = nodeId + ":" + name;
  const savedDraft = useAppStore.getState().invalidParams[draftKey];
  const [text, setText] = useState(
    () =>
      savedDraft ??
      (complex
        ? JSON.stringify(value ?? (schema.type === "array" ? [] : {}), null, 2)
        : String(value ?? "")),
  );
  const committed = useRef(value);
  useEffect(() => {
    if (committed.current !== value) {
      committed.current = value;
      setText(
        complex
          ? JSON.stringify(
              value ?? (schema.type === "array" ? [] : {}),
              null,
              2,
            )
          : String(value ?? ""),
      );
    }
  }, [value, complex, schema.type]);
  const [error, setError] = useState(
    savedDraft !== undefined
      ? "Enter a valid value before running or saving."
      : "",
  );
  const id = `param-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] text-gray-400">
        {name}
      </label>
      <textarea
        id={id}
        rows={complex || name === "code" ? 5 : 1}
        value={text}
        aria-invalid={!!error}
        title={schema.description}
        className="rounded border border-gray-700 bg-gray-900 p-2 font-mono text-xs"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            const parsed = complex
              ? JSON.parse(next)
              : schema.type === "number" && !next.includes("{{")
                ? Number(next)
                : schema.type === "boolean" && !next.includes("{{")
                  ? JSON.parse(next)
                  : next;
            if (schema.type === "array" && !Array.isArray(parsed))
              throw new Error("Expected an array");
            if (
              schema.type === "number" &&
              typeof parsed === "number" &&
              !Number.isFinite(parsed)
            )
              throw new Error("Expected a number");
            committed.current = parsed;
            onChange(parsed);
            setError("");
            useAppStore.setState((s) => {
              const invalidParams = { ...s.invalidParams };
              delete invalidParams[draftKey];
              return { invalidParams };
            });
          } catch {
            setError("Enter a valid value before running or saving.");
            useAppStore.setState((s) => ({
              invalidParams: { ...s.invalidParams, [draftKey]: next },
              isDirty: true,
            }));
          }
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
function ParamsForm({
  nodeId,
  params,
  schema,
  onChange,
}: {
  nodeId: string;
  params: Record<string, unknown>;
  schema: NonNullable<ReturnType<typeof findPaletteNode>>["paramsSchema"];
  onChange(key: string, value: unknown): void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(schema).map(([key, field]) => (
        <ParamField
          key={key}
          nodeId={nodeId}
          name={key}
          value={params[key] ?? field.default}
          schema={field}
          onChange={(value) => onChange(key, value)}
        />
      ))}
    </div>
  );
}

export function NodeEditor() {
  const isPreviewMode = useAppStore((s) => s.isPreviewMode);
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
    if (kind === "window") {
      newActionTarget.windowTitle = "";
      newActionTarget.appId = "";
    }
    if (kind === "region")
      newActionTarget.region = { x: 0, y: 0, width: 800, height: 600 };
    if (kind === "none")
      updateNodeData(selectedNode.id, { actionTarget: undefined });
    else updateNodeData(selectedNode.id, { actionTarget: newActionTarget });
  };

  const handleActionTargetFieldChange = (field: string, value: unknown) => {
    const current = (data.actionTarget as ActionTarget | undefined) ?? {
      kind: "screen",
    };
    updateNodeData(selectedNode.id, {
      actionTarget: { ...current, [field]: value },
    });
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

      <fieldset disabled={isPreviewMode} className="flex flex-col gap-3 p-3">
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
          <label className="text-[11px] font-medium text-gray-400">
            Runs on
          </label>
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
            <label className="text-[11px] font-medium text-indigo-400">
              Acts on
            </label>
            <div className="flex gap-1 flex-wrap">
              {ACTION_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const currentKind =
                  (data.actionTarget as ActionTarget | undefined)?.kind ??
                  "none";
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
            {data.actionTarget &&
              (data.actionTarget as ActionTarget).kind !== "none" && (
                <div className="mt-1 flex flex-col gap-1.5">
                  {(data.actionTarget as ActionTarget).kind === "screen" && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500">
                          Display
                        </label>
                        <input
                          type="text"
                          value={
                            (data.actionTarget as ActionTarget).display ??
                            "current"
                          }
                          onChange={(e) =>
                            handleActionTargetFieldChange(
                              "display",
                              e.target.value,
                            )
                          }
                          placeholder=":0 or DP-1 or current"
                          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500">
                          Monitor #
                        </label>
                        <input
                          type="number"
                          value={
                            (data.actionTarget as ActionTarget).monitor ?? 0
                          }
                          onChange={(e) =>
                            handleActionTargetFieldChange(
                              "monitor",
                              Number(e.target.value),
                            )
                          }
                          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                        />
                      </div>
                    </>
                  )}
                  {(data.actionTarget as ActionTarget).kind === "window" && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500">
                          Application
                        </label>
                        <input
                          type="text"
                          value={
                            (data.actionTarget as ActionTarget).appId ?? ""
                          }
                          onChange={(e) =>
                            handleActionTargetFieldChange(
                              "appId",
                              e.target.value,
                            )
                          }
                          placeholder="firefox, org.gnome.Terminal, etc."
                          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500">
                          Window title (regex)
                        </label>
                        <input
                          type="text"
                          value={
                            (data.actionTarget as ActionTarget).windowTitle ??
                            ""
                          }
                          onChange={(e) =>
                            handleActionTargetFieldChange(
                              "windowTitle",
                              e.target.value,
                            )
                          }
                          placeholder="e.g. Firefox.*GitHub"
                          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500">
                          Window ID (hex)
                        </label>
                        <input
                          type="text"
                          value={
                            (data.actionTarget as ActionTarget).windowId ?? ""
                          }
                          onChange={(e) =>
                            handleActionTargetFieldChange(
                              "windowId",
                              e.target.value,
                            )
                          }
                          placeholder="0x05600004"
                          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500">
                          Process ID
                        </label>
                        <input
                          type="number"
                          value={(data.actionTarget as ActionTarget).pid ?? 0}
                          onChange={(e) =>
                            handleActionTargetFieldChange(
                              "pid",
                              e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            )
                          }
                          className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                        />
                      </div>
                    </>
                  )}
                  {(data.actionTarget as ActionTarget).kind === "region" && (
                    <>
                      {(["x", "y", "width", "height"] as const).map((dim) => (
                        <div key={dim} className="flex flex-col gap-1">
                          <label className="text-[10px] text-gray-500 capitalize">
                            {dim}
                          </label>
                          <input
                            type="number"
                            value={
                              (data.actionTarget as ActionTarget).region?.[
                                dim
                              ] ?? 0
                            }
                            onChange={(e) =>
                              handleActionTargetFieldChange("region", {
                                ...((data.actionTarget as ActionTarget)
                                  .region ?? {
                                  x: 0,
                                  y: 0,
                                  width: 800,
                                  height: 600,
                                }),
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

        <ExecutionSettings nodeId={selectedNode.id} />

        <div className="border-t border-gray-800 pt-2">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Parameters
          </div>
          <ParamsForm
            key={selectedNode.id}
            nodeId={selectedNode.id}
            schema={paletteNode?.paramsSchema ?? {}}
            params={data.params as Record<string, unknown>}
            onChange={handleParamChange}
          />
        </div>

        <div className="border-t border-gray-800 pt-2">
          <button
            onClick={() => setShowTestInput(!showTestInput)}
            className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300"
          >
            {showTestInput ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
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
                JSON array of items to feed directly into the selected node
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
                  if (showTestInput) inputData = JSON.parse(testInputJson);
                  await executeNode(selectedNode.id, false, inputData);
                } catch (error) {
                  useAppStore.setState({
                    actionError: (error as Error).message,
                  });
                } finally {
                  setIsExecutingNode(false);
                }
              }}
              disabled={isExecutingNode}
              className="flex items-center gap-1 rounded bg-green-600/20 px-2 py-1 text-[11px] font-medium text-green-400 transition-colors hover:bg-green-600/30 disabled:opacity-50"
              title="Execute this node (uses cached inputs from last run)"
            >
              {isExecutingNode ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Execute
            </button>
            <button
              onClick={async () => {
                setIsExecutingNode(true);
                try {
                  let inputData;
                  if (showTestInput) inputData = JSON.parse(testInputJson);
                  await executeNode(selectedNode.id, true, inputData);
                } catch (error) {
                  useAppStore.setState({
                    actionError: (error as Error).message,
                  });
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
      </fieldset>
    </div>
  );
}

function ExecutionSettings({ nodeId }: { nodeId: string }) {
  const data = useAppStore((s) => s.rfNodes.find((n) => n.id === nodeId)?.data);
  const update = useAppStore((s) => s.updateNodeData);
  const automationId = useAppStore((s) => s.currentAutomationId);
  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    fetchJson<CredentialMetadata[]>("/api/credentials")
      .then((c) => {
        if (active) setCredentials(c);
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, [nodeId]);
  if (!data) return null;
  return (
    <div className="space-y-2 border-t border-gray-800 pt-2 text-xs">
      <label className="block">
        Credential
        <select
          className="w-full rounded bg-gray-900 p-2"
          value={
            credentials.find(
              (c) =>
                c.name === data.credentials?.name &&
                c.type === data.credentials?.type,
            )?.id ?? ""
          }
          onChange={(e) => {
            const cred = credentials.find((c) => c.id === e.target.value);
            update(nodeId, {
              credentials: cred ? { name: cred.name, type: cred.type } : null,
            });
          }}
        >
          <option value="">None (AI provider settings for vision LLM)</option>
          {credentials.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Node timeout (seconds)
        <input
          className="w-full rounded bg-gray-900 p-2"
          type="number"
          min="0.01"
          max="86400"
          value={data.timeoutSec ?? 300}
          onChange={(e) =>
            update(nodeId, { timeoutSec: Number(e.target.value) })
          }
        />
      </label>
      <label className="block">
        Maximum attempts
        <input
          className="w-full rounded bg-gray-900 p-2"
          type="number"
          min="1"
          max="10"
          value={data.retry?.attempts ?? 1}
          onChange={(e) =>
            update(nodeId, {
              retry: {
                attempts: Number(e.target.value),
                backoffSec: [2, 5, 10, 30],
              },
            })
          }
        />
      </label>
      {data.nodeType === "trigger.webhook" && (
        <>
          <p className="break-all">
            Production: {location.origin}/hooks/{automationId}/
            {String(data.params.path ?? "")}
          </p>
          <button
            className="rounded border border-gray-700 p-1"
            onClick={async () => {
              try {
                await useAppStore.getState().saveAutomation();
                if (useAppStore.getState().saveError)
                  throw new Error(useAppStore.getState().saveError!);
                const result = await fetchJson<{ url: string }>(
                  `/api/automations/${automationId}/webhook-test`,
                  { method: "POST", body: JSON.stringify({ nodeId }) },
                );
                setNotice(
                  `Listening for two minutes: ${location.origin}${result.url}`,
                );
              } catch (e) {
                setNotice((e as Error).message);
              }
            }}
          >
            Listen for test webhook
          </button>
        </>
      )}
      {notice && (
        <p role="status" className="break-all">
          {notice}
        </p>
      )}
    </div>
  );
}
