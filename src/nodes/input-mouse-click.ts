import { desktopInput } from "../core/desktop-driver.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface MouseClickParams {
  x: number;
  y: number;
  button: string;
  clickCount: number;
}

const definition: NodeDefinition<MouseClickParams> = {
  type: "input.mouse.click",
  version: 1,
  displayName: "Mouse Click",
  category: "input",
  icon: "🖱️",
  sideEffecting: true,
  requiredCapabilities: { input: "xdotool" },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    x: { type: "number", description: "X coordinate" },
    y: { type: "number", description: "Y coordinate" },
    button: {
      type: "string",
      default: "left",
      description: "Mouse button: left, right, middle",
    },
    clickCount: { type: "number", default: 1, description: "Number of clicks" },
  },

  async run(ctx: RunContext<MouseClickParams>): Promise<NodeItem[]> {
    await desktopInput(
      "click",
      ctx.params as unknown as Record<string, unknown>,
      ctx.actionTarget,
    );
    return [{ json: { ...ctx.params, success: true } }];
  },

  async simulate(ctx: RunContext<MouseClickParams>): Promise<SimulationReport> {
    return {
      description: "Mouse Click",
      wouldDo: `would click ${ctx.params.button} at (${ctx.params.x}, ${ctx.params.y})`,
    };
  },
};

nodeRegistry.register(definition);
