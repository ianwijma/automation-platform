import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

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
    const { text, delay } = ctx.params;
    const inputMethod = detectInputMethod();

    if (inputMethod === "xdotool") {
      const proc = Bun.spawn(["xdotool", "type", "--delay", String(delay), text], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`xdotool type failed: ${stderr}`);
      }
    } else if (inputMethod === "ydotool") {
      const proc = Bun.spawn(["ydotool", "type", text], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
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
