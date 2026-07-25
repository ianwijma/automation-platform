import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AutomationNodeData } from "../types";
import { CATEGORY_COLORS, CATEGORY_TEXT, CATEGORY_BORDER } from "../types";
import { Monitor, Server, Tag, Zap, Ban } from "lucide-react";

const TARGET_ICONS: Record<string, typeof Monitor> = {
  local: Monitor,
  machine: Server,
  tag: Tag,
  any: Zap,
};

function TargetBadge({ kind, value }: { kind: string; value?: string }) {
  const Icon = TARGET_ICONS[kind] ?? Monitor;
  const label =
    kind === "local"
      ? "local"
      : kind === "machine"
        ? (value ?? "machine")
        : kind === "tag"
          ? (value ?? "tag")
          : "any";

  return (
    <div className="flex items-center gap-1 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
      <Icon className="h-2.5 w-2.5" />
      <span>{label}</span>
    </div>
  );
}

function AutomationNodeComponent(props: NodeProps) {
  const data = props.data as unknown as AutomationNodeData;
  const selected = props.selected;
  const category = data.category;
  const color = CATEGORY_COLORS[category] ?? "#6b7280";
  const borderClass = CATEGORY_BORDER[category] ?? "border-gray-500/60";
  const textClass = CATEGORY_TEXT[category] ?? "text-gray-400";

  const handles = [];
  if (category !== "trigger") {
    handles.push(
      <Handle
        key="in"
        type="target"
        position={Position.Left}
        id="in"
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-gray-400"
      />,
    );
  }

  const nodeType = data.nodeType;
  if (nodeType === "logic.if") {
    handles.push(
      <Handle
        key="true"
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: "30%" }}
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-green-400"
      >
        <span className="absolute -right-4 -top-1 text-[9px] text-green-400">T</span>
      </Handle>,
      <Handle
        key="false"
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: "70%" }}
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-red-400"
      >
        <span className="absolute -right-4 -top-1 text-[9px] text-red-400">F</span>
      </Handle>,
    );
  } else if (nodeType === "logic.merge") {
    handles.push(
      <Handle
        key="in1"
        type="target"
        position={Position.Left}
        id="in1"
        style={{ top: "30%" }}
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-gray-400"
      />,
      <Handle
        key="in2"
        type="target"
        position={Position.Left}
        id="in2"
        style={{ top: "70%" }}
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-gray-400"
      />,
      <Handle
        key="out"
        type="source"
        position={Position.Right}
        id="out"
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-gray-400"
      />,
    );
  } else {
    handles.push(
      <Handle
        key="out"
        type="source"
        position={Position.Right}
        id="out"
        className="!h-3 !w-3 !border-2 !border-gray-700 !bg-gray-400"
      />,
    );
  }

  const target = data.target as { kind: string; value?: string };

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
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold uppercase tracking-wider ${textClass}`}>
            {category}
          </span>
          <TargetBadge kind={target.kind} value={target.value} />
        </div>
        <div className="mt-1.5 text-sm font-medium text-gray-100 leading-tight">
          {data.name}
        </div>
        <div className="mt-0.5 text-[11px] text-gray-500">
          {nodeType}
        </div>
      </div>

      {data.disabled && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-950/60">
          <Ban className="h-5 w-5 text-gray-400" />
        </div>
      )}

      {handles}
    </div>
  );
}

export const AutomationNodeFlow = memo(AutomationNodeComponent);
