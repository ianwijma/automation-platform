import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { spawnAndCapture } from "../core/safe-spawn.js";

interface KeyboardTypeParams {
  text: string;
  delay: number;
}

function detectInputMethod(): "xdotool" | "ydotool" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if ((sessionType === "x11" || process.env.DISPLAY) && !process.env.WAYLAND_DISPLAY) {
    return "xdotool";
  }
  return "ydotool";
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
    delay: { type: "number", default: 12, description: "Delay between keystrokes in ms" },
  },

  async run(ctx: RunContext<KeyboardTypeParams>): Promise<NodeItem[]> {
    const { text } = ctx.params;
    const delay = ctx.params.delay ?? 12;
    const inputMethod = detectInputMethod();

    if (inputMethod === "xdotool") {
      const { exitCode, stderr } = await spawnAndCapture({ cmd: ["xdotool", "type", "--delay", String(delay), text] });
      if (exitCode !== 0) {
        throw new Error(`xdotool type failed: ${stderr}`);
      }
    } else if (inputMethod === "ydotool") {
      const { exitCode, stderr } = await spawnAndCapture({ cmd: ["ydotool", "type", text] });
      if (exitCode !== 0) {
        throw new Error(`ydotool type failed: ${stderr}`);
      }
    } else {
      throw new Error("No input method available. Install xdotool (X11) or ydotool (Wayland).");
    }

    return [
      {
        json: { text, delay },
      },
    ];
  },

  async simulate(ctx: RunContext<KeyboardTypeParams>): Promise<SimulationReport> {
    return {
      description: "Keyboard Type",
      wouldDo: `would type '${ctx.params.text}'`,
    };
  },
};

nodeRegistry.register(definition);
