import { listWindows } from "../core/desktop-driver.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface WindowListParams {
  filter?: string;
  pid?: number;
  includeGeometry?: boolean;
}

const definition: NodeDefinition<WindowListParams> = {
  type: "vision.window.list",
  version: 1,
  displayName: "List Windows",
  category: "vision",
  icon: "🪟",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    filter: {
      type: "string",
      default: "",
      description: "Regex to filter window titles",
    },
    pid: {
      type: "number",
      default: 0,
      description: "Filter by process ID (0 = no filter)",
    },
    includeGeometry: {
      type: "boolean",
      default: true,
      description: "Include window position and size",
    },
  },

  async run(ctx: RunContext<WindowListParams>): Promise<NodeItem[]> {
    const windows = (await listWindows()).filter(
      (w) =>
        (!ctx.params.pid || w.pid === ctx.params.pid) &&
        (!ctx.params.filter || new RegExp(ctx.params.filter).test(w.title)),
    );
    return windows.map((window) => ({ json: { ...window } }));
  },

  async simulate(
    _ctx: RunContext<WindowListParams>,
  ): Promise<SimulationReport> {
    return {
      description: "List Windows",
      wouldDo: "would list windows matching filter",
    };
  },
};

nodeRegistry.register(definition);
