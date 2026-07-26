import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AutomationNodeData, ActionTarget } from "../types";
import { CATEGORY_COLORS, CATEGORY_BORDER, ACTION_TARGET_LABELS } from "../types";
import { getPalettePorts } from "./NodePalette";
import { Monitor, Server, Tag, Zap, Ban, ScreenShare, AppWindow, Square, File } from "lucide-react";
import { useAppStore } from "../store";

const TARGET_ICONS: Record<string, typeof Monitor> = {
  local: Monitor,
  machine: Server,
  tag: Tag,
  any: Zap,
};

const ACTION_ICONS: Record<string, typeof ScreenShare> = {
  screen: ScreenShare,
  window: AppWindow,
  region: Square,
  file: File,
  none: Ban,
};

function RunsOnBadge({ kind, value, offline }: { kind: string; value?: string; offline?: boolean }) {
  const Icon = TARGET_ICONS[kind] ?? Monitor;
  const label =
    kind === "local"
      ? "local"
      : kind === "machine"
        ? (value ?? "machine")
        : kind === "tag"
          ? (value ?? "tag")
          : "any";

  if (offline) {
    return (
      <div className="flex items-center gap-1 rounded bg-red-900/60 px-1.5 py-0.5 text-[10px] text-red-300 border border-red-500/40">
        <Ban className="h-2.5 w-2.5" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
      <Icon className="h-2.5 w-2.5" />
      <span>{label}</span>
    </div>
  );
}

function ActsOnBadge({ actionTarget }: { actionTarget?: ActionTarget }) {
  if (!actionTarget || actionTarget.kind === "none") return null;

  const Icon = ACTION_ICONS[actionTarget.kind] ?? Square;
  const kindLabel = ACTION_TARGET_LABELS[actionTarget.kind] ?? actionTarget.kind;

  let detail = "";
  if (actionTarget.kind === "screen") {
    detail = actionTarget.display ?? (actionTarget.monitor != null ? `#${actionTarget.monitor}` : "");
  } else if (actionTarget.kind === "window") {
    detail = actionTarget.appId ?? actionTarget.windowTitle ?? actionTarget.windowId ?? (actionTarget.pid ? `pid:${actionTarget.pid}` : "");
  } else if (actionTarget.kind === "region") {
    const r = actionTarget.region;
    detail = r ? `${r.width}×${r.height}` : "";
  } else if (actionTarget.kind === "file") {
    detail = "";
  }

  const fullLabel = detail ? `${kindLabel}: ${detail}` : kindLabel;

  return (
    <div className="flex items-center gap-1 rounded bg-indigo-900/40 px-1.5 py-0.5 text-[10px] text-indigo-300 border border-indigo-500/30">
      <Icon className="h-2.5 w-2.5" />
      <span className="max-w-[100px] truncate">{fullLabel}</span>
    </div>
  );
}

function AutomationNodeComponent(props: NodeProps) {
  const data = props.data as unknown as AutomationNodeData;
  const selected = props.selected;
  const category = data.category;
  const color = CATEGORY_COLORS[category] ?? "#6b7280";
  const borderClass = CATEGORY_BORDER[category] ?? "border-gray-500/60";

  const dryRun = useAppStore((s) => s.dryRun);
  const nodeExecutions = useAppStore((s) => s.nodeExecutions);
  const currentRunId = useAppStore((s) => s.currentRunId);
  const agents = useAppStore((s) => s.agents);

  const nodeExecs = nodeExecutions[props.id] ?? [];
  const latestExec = nodeExecs[0];
  const isSimulated = dryRun || (currentRunId && latestExec?.simulated === true);

  const target = data.target as { kind: string; value?: string };
  const actionTarget = data.actionTarget as ActionTarget | undefined;
  const isTargetOffline =
    !data.disabled &&
    target.kind !== "local" &&
    (() => {
      if (target.kind === "machine") {
        const agent = agents.find((a) => a.id === target.value || a.name === target.value);
        return !agent || agent.status === "offline";
      }
      if (target.kind === "tag") {
        const matching = agents.filter((a) => a.tags.includes(target.value ?? ""));
        return matching.length === 0 || matching.every((a) => a.status === "offline");
      }
      if (target.kind === "any") {
        const online = agents.filter((a) => a.status === "online" && !a.isLocal);
        return online.length === 0;
      }
      return false;
    })();

  const ports = getPalettePorts(data.nodeType);
  const handles = [];

  for (const input of ports.inputs) {
    const totalInputs = ports.inputs.length;
    const idx = ports.inputs.indexOf(input);
    const topPercent = totalInputs === 1 ? 50 : (30 + (40 * idx) / (totalInputs - 1));
    handles.push(
      <Handle
        key={input.name}
        type="target"
        position={Position.Left}
        id={input.name}
        style={{ top: `${topPercent}%` }}
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-gray-400"
      />,
    );
  }

  for (const output of ports.outputs) {
    const totalOutputs = ports.outputs.length;
    const idx = ports.outputs.indexOf(output);
    const topPercent = totalOutputs === 1 ? 50 : (30 + (40 * idx) / (totalOutputs - 1));
    const isTrue = output.name === "true";
    const isFalse = output.name === "false";
    const bgClass = isTrue
      ? "!bg-green-400"
      : isFalse
        ? "!bg-red-400"
        : "!bg-gray-400";
    const label = isTrue ? "T" : isFalse ? "F" : "";
    handles.push(
      <Handle
        key={output.name}
        type="source"
        position={Position.Right}
        id={output.name}
        style={{ top: `${topPercent}%` }}
        className={`!h-3 !w-3 !border-2 !border-gray-700 ${bgClass}`}
      >
        {label && (
          <span className={`absolute -right-4 -top-1 text-[9px] ${isTrue ? "text-green-400" : "text-red-400"}`}>
            {label}
          </span>
        )}
      </Handle>,
    );
  }

  return (
    <div
      className={`min-w-[160px] relative rounded-lg border ${borderClass} bg-gray-900 shadow-lg transition-shadow ${
        selected ? "ring-2 ring-white/30 shadow-white/10" : ""
      }`}
    >
      <div
        className="h-1.5 rounded-t-lg"
        style={{ backgroundColor: color }}
      />
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <RunsOnBadge kind={target.kind} value={target.value} offline={isTargetOffline} />
          <ActsOnBadge actionTarget={actionTarget} />
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-600">
          {category}
        </div>
        <div className="mt-0.5 text-sm font-medium text-gray-100 leading-tight">
          {data.name}
        </div>
        <div className="mt-0.5 text-[11px] text-gray-500">
          {data.nodeType}
        </div>
      </div>

      {data.disabled && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-950/60">
          <Ban className="h-5 w-5 text-gray-400" />
        </div>
      )}

      {isSimulated && !data.disabled && (
        <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(245,158,11,0.15) 4px, rgba(245,158,11,0.15) 5px)",
            }}
          />
          <div className="absolute top-1 right-1 rounded bg-amber-500/80 px-1 py-0.5 text-[8px] font-bold uppercase text-black">
            sim
          </div>
        </div>
      )}

      {handles}
    </div>
  );
}

export const AutomationNodeFlow = memo(AutomationNodeComponent);
