import catalog from "../node-catalog.json";
import { useState } from "react";
import {
  Hand,
  Clock,
  Globe,
  Radio,
  Terminal,
  Rocket,
  GitBranch,
  Shuffle,
  GitMerge,
  Repeat,
  Timer,
  Braces,
  Code2,
  AlertTriangle,
  Database,
  Save,
  Camera,
  LayoutGrid,
  Monitor,
  ScanLine,
  Eye,
  Sparkles,
  MousePointerClick,
  Move,
  Keyboard,
  KeyRound,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { PaletteNodeType, PortSchema } from "../types";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Hand,
  Clock,
  Globe,
  Radio,
  Terminal,
  Rocket,
  GitBranch,
  Shuffle,
  GitMerge,
  Repeat,
  Timer,
  Braces,
  Code2,
  AlertTriangle,
  Database,
  Save,
  Camera,
  LayoutGrid,
  Monitor,
  ScanLine,
  Eye,
  Sparkles,
  MousePointerClick,
  Move,
  Keyboard,
  KeyRound,
};

export const PALETTE_NODES: PaletteNodeType[] = catalog.map((spec) => ({
  type: spec.type,
  displayName: spec.displayName,
  category: spec.category === "triggers" ? "trigger" : spec.category,
  icon: "Code2",
  paramsSchema: spec.paramsSchema as unknown as PaletteNodeType["paramsSchema"],
  inputs: (spec.type === "logic.loop"
    ? [...spec.inputs, { name: "continue", type: "item" }]
    : spec.inputs) as PortSchema[],
  outputs: [
    ...spec.outputs,
    ...(spec.outputs.some((p) => p.name === "error")
      ? []
      : [{ name: "error", type: "item" }]),
  ] as PortSchema[],
  defaultParams: Object.fromEntries(
    Object.entries(spec.paramsSchema).map(([key, raw]) => {
      const field = raw as { type?: string; default?: unknown };
      return [
        key,
        field.default ??
          (field.type === "array"
            ? []
            : field.type === "object"
              ? {}
              : field.type === "number"
                ? 0
                : field.type === "boolean"
                  ? false
                  : ""),
      ];
    }),
  ),
}));

const CATEGORIES = [
  { key: "trigger", label: "Triggers" },
  { key: "execution", label: "Execution" },
  { key: "logic", label: "Logic" },
  { key: "state", label: "State" },
  { key: "vision", label: "Vision" },
  { key: "input", label: "Input" },
];

const CATEGORY_DOT: Record<string, string> = {
  trigger: "bg-blue-400",
  execution: "bg-green-400",
  logic: "bg-orange-400",
  state: "bg-purple-400",
  vision: "bg-pink-400",
  input: "bg-teal-400",
};

export function findPaletteNode(type: string): PaletteNodeType | undefined {
  return PALETTE_NODES.find((n) => n.type === type);
}

export function getPalettePorts(
  type: string,
  params?: Record<string, unknown>,
): { inputs: PortSchema[]; outputs: PortSchema[] } {
  const node = findPaletteNode(type);
  return {
    inputs: node?.inputs ?? [{ name: "in", type: "item" as const }],
    outputs:
      type === "logic.switch"
        ? [
            ...new Set([
              ...(Array.isArray(params?.rules)
                ? params.rules.map((r) => String(r.label))
                : []),
              String(params?.fallback || "default"),
              "error",
            ]),
          ].map((name) => ({ name, type: "item" as const }))
        : (node?.outputs ?? [{ name: "out", type: "item" as const }]),
  };
}

export function NodePalette() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    trigger: true,
    execution: true,
    logic: false,
    state: false,
    vision: false,
    input: false,
  });

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const onDragStart = (event: React.DragEvent, nodeType: PaletteNodeType) => {
    event.dataTransfer.setData(
      "application/automation-node",
      JSON.stringify(nodeType),
    );
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-2">
      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        Node Palette
      </div>
      {CATEGORIES.map((cat) => {
        const nodes = PALETTE_NODES.filter((n) => n.category === cat.key);
        const isOpen = expanded[cat.key] ?? false;

        return (
          <div key={cat.key}>
            <button
              onClick={() => toggle(cat.key)}
              className="flex w-full items-center gap-2 rounded px-1 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800"
            >
              <span
                className={`h-2 w-2 rounded-full ${CATEGORY_DOT[cat.key]}`}
              />
              {isOpen ? (
                <ChevronDown className="h-3 w-3 text-gray-500" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-500" />
              )}
              {cat.label}
              <span className="ml-auto text-[10px] text-gray-600">
                {nodes.length}
              </span>
            </button>

            {isOpen && (
              <div className="ml-2 flex flex-col gap-0.5 pb-1">
                {nodes.map((node) => {
                  const Icon = ICON_MAP[node.icon] ?? Code2;
                  return (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, node)}
                      className="flex cursor-grab items-center gap-2 rounded-md border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-800 active:cursor-grabbing"
                    >
                      <Icon className="h-3.5 w-3.5 text-gray-400" />
                      <span className="truncate">{node.displayName}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
