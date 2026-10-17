import { desktopInput } from "../core/desktop-driver.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface KeyboardTypeParams {
  text: string;
  delay: number;
}

const definition: NodeDefinition<KeyboardTypeParams> = {
  type: "input.keyboard.type",
  version: 1,
  displayName: "Keyboard Type",
  category: "input",
  icon: "⌨️",
  sideEffecting: true,
  requiredCapabilities: { input: "xdotool" },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    text: { type: "string", description: "Text to type" },
    delay: {
      type: "number",
      default: 12,
      description: "Delay between keystrokes in ms",
    },
  },

  async run(ctx: RunContext<KeyboardTypeParams>): Promise<NodeItem[]> {
    await desktopInput(
      "type",
      ctx.params as unknown as Record<string, unknown>,
      ctx.actionTarget,
    );
    return [{ json: { ...ctx.params, success: true } }];
  },

  async simulate(
    ctx: RunContext<KeyboardTypeParams>,
  ): Promise<SimulationReport> {
    return {
      description: "Keyboard Type",
      wouldDo: `would type '${ctx.params.text}'`,
    };
  },
};

nodeRegistry.register(definition);
