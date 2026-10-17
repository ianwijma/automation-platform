import { desktopInput } from "../core/desktop-driver.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface MouseMoveParams {
  x: number;
  y: number;
}

const definition: NodeDefinition<MouseMoveParams> = {
  type: "input.mouse.move",
  version: 1,
  displayName: "Mouse Move",
  category: "input",
  icon: "🖱️",
  sideEffecting: true,
  requiredCapabilities: { input: "xdotool" },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    x: { type: "number", description: "X coordinate" },
    y: { type: "number", description: "Y coordinate" },
  },

  async run(ctx: RunContext<MouseMoveParams>): Promise<NodeItem[]> {
    await desktopInput(
      "move",
      ctx.params as unknown as Record<string, unknown>,
      ctx.actionTarget,
    );
    return [{ json: { ...ctx.params, success: true } }];
  },

  async simulate(ctx: RunContext<MouseMoveParams>): Promise<SimulationReport> {
    return {
      description: "Mouse Move",
      wouldDo: `would move to (${ctx.params.x}, ${ctx.params.y})`,
    };
  },
};

nodeRegistry.register(definition);
