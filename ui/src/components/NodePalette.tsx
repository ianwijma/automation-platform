import { useState } from "react";
import {
  Hand,
  Clock,
  Globe,
  Radio,
  Terminal,
  Rocket,
  FileText,
  FileDown,
  Send,
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
  FileText,
  FileDown,
  Send,
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

export const PALETTE_NODES: PaletteNodeType[] = [
  { type: "trigger.manual", displayName: "Manual Trigger", category: "trigger", icon: "Hand", defaultParams: {}, inputs: [], outputs: [{ name: "out", type: "item" }] },
  { type: "trigger.schedule", displayName: "Schedule", category: "trigger", icon: "Clock", defaultParams: { cron: "0 * * * *" }, inputs: [], outputs: [{ name: "out", type: "item" }] },
  { type: "trigger.webhook", displayName: "Webhook", category: "trigger", icon: "Globe", defaultParams: { path: "", method: "POST" }, inputs: [], outputs: [{ name: "out", type: "item" }] },
  { type: "trigger.polling", displayName: "Polling", category: "trigger", icon: "Radio", defaultParams: { intervalSec: 60, url: "" }, inputs: [], outputs: [{ name: "out", type: "item" }] },

  { type: "system.command", displayName: "Command", category: "execution", icon: "Terminal", defaultParams: { command: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "system.launch", displayName: "Launch Program", category: "execution", icon: "Rocket", defaultParams: { command: "", waitForWindowSec: 0 }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "fs.read", displayName: "Read File", category: "execution", icon: "FileText", defaultParams: { path: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "fs.write", displayName: "Write File", category: "execution", icon: "FileDown", defaultParams: { path: "", content: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "http.request", displayName: "HTTP Request", category: "execution", icon: "Send", defaultParams: { url: "", method: "GET", headers: {} }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },

  { type: "logic.if", displayName: "IF", category: "logic", icon: "GitBranch", defaultParams: { condition: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "true", type: "item" }, { name: "false", type: "item" }] },
  { type: "logic.switch", displayName: "Switch", category: "logic", icon: "Shuffle", defaultParams: { rules: [] }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "default", type: "item" }] },
  { type: "logic.merge", displayName: "Merge", category: "logic", icon: "GitMerge", defaultParams: {}, inputs: [{ name: "in1", type: "item" }, { name: "in2", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "logic.loop", displayName: "Loop", category: "logic", icon: "Repeat", defaultParams: { count: 0 }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "logic.delay", displayName: "Delay", category: "logic", icon: "Timer", defaultParams: { seconds: 1 }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "logic.set", displayName: "Set", category: "logic", icon: "Braces", defaultParams: { values: {} }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "logic.code", displayName: "Code", category: "logic", icon: "Code2", defaultParams: { code: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "error.throw", displayName: "Throw Error", category: "logic", icon: "AlertTriangle", defaultParams: { message: "" }, inputs: [{ name: "in", type: "item" }], outputs: [] },

  { type: "state.get", displayName: "Get State", category: "state", icon: "Database", defaultParams: { key: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "state.set", displayName: "Set State", category: "state", icon: "Save", defaultParams: { key: "", value: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },

  { type: "vision.screenshot", displayName: "Screenshot", category: "vision", icon: "Camera", defaultParams: { display: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "vision.window.list", displayName: "Window List", category: "vision", icon: "LayoutGrid", defaultParams: { filter: "", pid: 0 }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "vision.window.screenshot", displayName: "Window Screenshot", category: "vision", icon: "Monitor", defaultParams: { windowId: "", activateFirst: true }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "vision.ocr", displayName: "OCR", category: "vision", icon: "ScanLine", defaultParams: {}, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "vision.image.detect", displayName: "Image Detect", category: "vision", icon: "Eye", defaultParams: { model: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "vision.llm", displayName: "LLM", category: "vision", icon: "Sparkles", defaultParams: { model: "", prompt: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },

  { type: "input.mouse.click", displayName: "Mouse Click", category: "input", icon: "MousePointerClick", defaultParams: { x: 0, y: 0, button: "left" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "input.mouse.move", displayName: "Mouse Move", category: "input", icon: "Move", defaultParams: { x: 0, y: 0 }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "input.keyboard.type", displayName: "Type Text", category: "input", icon: "Keyboard", defaultParams: { text: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
  { type: "input.keyboard.key", displayName: "Press Key", category: "input", icon: "KeyRound", defaultParams: { key: "" }, inputs: [{ name: "in", type: "item" }], outputs: [{ name: "out", type: "item" }] },
];

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

export function getPalettePorts(type: string): { inputs: PortSchema[]; outputs: PortSchema[] } {
  const node = findPaletteNode(type);
  return {
    inputs: node?.inputs ?? [{ name: "in", type: "item" as const }],
    outputs: node?.outputs ?? [{ name: "out", type: "item" as const }],
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
              <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT[cat.key]}`} />
              {isOpen ? (
                <ChevronDown className="h-3 w-3 text-gray-500" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-500" />
              )}
              {cat.label}
              <span className="ml-auto text-[10px] text-gray-600">{nodes.length}</span>
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
