import { desktopInput } from "../core/desktop-driver.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface KeyboardKeyParams {
  key: string;
}

const definition: NodeDefinition<KeyboardKeyParams> = {
  type: "input.keyboard.key",
  version: 1,
  displayName: "Keyboard Key",
  category: "input",
  icon: "⌨️",
  sideEffecting: true,
  requiredCapabilities: { input: "xdotool" },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    key: {
      type: "string",
      description: "Key combination (e.g. ctrl+s, Return, Escape)",
    },
  },

  async run(ctx: RunContext<KeyboardKeyParams>): Promise<NodeItem[]> {
    await desktopInput(
      "key",
      ctx.params as unknown as Record<string, unknown>,
      ctx.actionTarget,
    );
    return [{ json: { ...ctx.params, success: true } }];
  },

  async simulate(
    ctx: RunContext<KeyboardKeyParams>,
  ): Promise<SimulationReport> {
    return {
      description: "Keyboard Key",
      wouldDo: `would press '${ctx.params.key}'`,
    };
  },
};

nodeRegistry.register(definition);
