import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { spawnAndCapture } from "../core/safe-spawn.js";

interface KeyboardKeyParams {
  key: string;
}

function detectInputMethod(): "xdotool" | "ydotool" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if ((sessionType === "x11" || process.env.DISPLAY) && !process.env.WAYLAND_DISPLAY) {
    return "xdotool";
  }
  return "ydotool";
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
    key: { type: "string", description: "Key combination (e.g. ctrl+s, Return, Escape)" },
  },

  async run(ctx: RunContext<KeyboardKeyParams>): Promise<NodeItem[]> {
    const { key } = ctx.params;
    const inputMethod = detectInputMethod();

    if (inputMethod === "xdotool") {
      const { exitCode, stderr } = await spawnAndCapture({ cmd: ["xdotool", "key", key] });
      if (exitCode !== 0) {
        throw new Error(`xdotool key failed: ${stderr}`);
      }
    } else if (inputMethod === "ydotool") {
      const { exitCode, stderr } = await spawnAndCapture({ cmd: ["ydotool", "key", key] });
      if (exitCode !== 0) {
        throw new Error(`ydotool key failed: ${stderr}`);
      }
    } else {
      throw new Error("No input method available. Install xdotool (X11) or ydotool (Wayland).");
    }

    return [
      {
        json: { key },
      },
    ];
  },

  async simulate(ctx: RunContext<KeyboardKeyParams>): Promise<SimulationReport> {
    return {
      description: "Keyboard Key",
      wouldDo: `would press '${ctx.params.key}'`,
    };
  },
};

nodeRegistry.register(definition);
