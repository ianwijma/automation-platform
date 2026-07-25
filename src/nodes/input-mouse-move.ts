import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface MouseMoveParams {
  x: number;
  y: number;
}

function detectInputMethod(): "xdotool" | "ydotool" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if ((sessionType === "x11" || process.env.DISPLAY) && !process.env.WAYLAND_DISPLAY) {
    return "xdotool";
  }
  return "ydotool";
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
    const { x, y } = ctx.params;
    const inputMethod = detectInputMethod();

    if (inputMethod === "xdotool") {
      const proc = Bun.spawn(["xdotool", "mousemove", String(x), String(y)], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`xdotool mousemove failed: ${stderr}`);
      }
    } else if (inputMethod === "ydotool") {
      const proc = Bun.spawn(["ydotool", "mousemove", "--absolute", String(x), String(y)], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`ydotool mousemove failed: ${stderr}`);
      }
    } else {
      throw new Error("No input method available. Install xdotool (X11) or ydotool (Wayland).");
    }

    return [
      {
        json: { x, y },
      },
    ];
  },

  async simulate(ctx: RunContext<MouseMoveParams>): Promise<SimulationReport> {
    return {
      description: "Mouse Move",
      wouldDo: `would move to (${ctx.params.x}, ${ctx.params.y})`,
    };
  },
};

nodeRegistry.register(definition);
