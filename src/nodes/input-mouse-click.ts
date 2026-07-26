import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { spawnAndCapture } from "../core/safe-spawn.js";

interface MouseClickParams {
  x: number;
  y: number;
  button: string;
  clickCount: number;
}

const BUTTON_MAP_WAYLAND: Record<string, string> = {
  left: "0x110",
  right: "0x111",
  middle: "0x112",
};

function detectInputMethod(): "xdotool" | "ydotool" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if ((sessionType === "x11" || process.env.DISPLAY) && !process.env.WAYLAND_DISPLAY) {
    return "xdotool";
  }
  return "ydotool";
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
    button: { type: "string", default: "left", description: "Mouse button: left, right, middle" },
    clickCount: { type: "number", default: 1, description: "Number of clicks" },
  },

  async run(ctx: RunContext<MouseClickParams>): Promise<NodeItem[]> {
    const x = ctx.params.x;
    const y = ctx.params.y;
    const button = ctx.params.button ?? "left";
    const clickCount = ctx.params.clickCount ?? 1;
    const inputMethod = detectInputMethod();

    if (inputMethod === "xdotool") {
      const clickCmd = clickCount > 1 ? `xdotool click --repeat ${clickCount} ${button}` : `xdotool click ${button}`;
      const cmd = `xdotool mousemove ${x} ${y} && ${clickCmd}`;
      const { exitCode, stderr } = await spawnAndCapture({ cmd: ["bash", "-c", cmd] });
      if (exitCode !== 0) {
        throw new Error(`xdotool mouse click failed: ${stderr}`);
      }
    } else if (inputMethod === "ydotool") {
      const waylandButton = BUTTON_MAP_WAYLAND[button] ?? "0x110";
      const cmd = `ydotool mousemove --absolute ${x} ${y} && ydotool click ${waylandButton}`;
      const { exitCode, stderr } = await spawnAndCapture({ cmd: ["bash", "-c", cmd] });
      if (exitCode !== 0) {
        throw new Error(`ydotool mouse click failed: ${stderr}`);
      }
    } else {
      throw new Error("No input method available. Install xdotool (X11) or ydotool (Wayland).");
    }

    return [
      {
        json: { x, y, button, success: true },
      },
    ];
  },

  async simulate(ctx: RunContext<MouseClickParams>): Promise<SimulationReport> {
    return {
      description: "Mouse Click",
      wouldDo: `would click ${ctx.params.button} at (${ctx.params.x}, ${ctx.params.y})`,
    };
  },
};

nodeRegistry.register(definition);
