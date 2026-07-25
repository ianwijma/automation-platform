import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface ScreenshotParams {
  display?: "current" | "select";
}

const SCREENSHOT_PATH = "/tmp/ap_screenshot.png";

async function tryCommand(cmd: string[]): Promise<{ ok: boolean; stderr: string }> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    return { ok: exitCode === 0, stderr };
  } catch (e: unknown) {
    return { ok: false, stderr: String(e) };
  }
}

function detectDisplayServer(): "x11" | "wayland" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if (sessionType === "wayland") return "wayland";
  if (sessionType === "x11") return "x11";
  if (process.env.WAYLAND_DISPLAY) return "wayland";
  if (process.env.DISPLAY) return "x11";
  return "none";
}

const definition: NodeDefinition<ScreenshotParams> = {
  type: "vision.screenshot",
  version: 1,
  displayName: "Screenshot",
  category: "vision",
  icon: "📸",
  sideEffecting: true,
  requiredCapabilities: { screen: true },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    display: { type: "string", default: "current", description: "Display to capture" },
  },

  async run(ctx: RunContext<ScreenshotParams>): Promise<NodeItem[]> {
    const displayServer = detectDisplayServer();

    let captured = false;
    let lastError = "";

    if (displayServer === "x11") {
      const attempts = [
        ["maim", SCREENSHOT_PATH],
        ["scrot", SCREENSHOT_PATH],
        ["import", "-window", "root", SCREENSHOT_PATH],
      ];
      for (const cmd of attempts) {
        const result = await tryCommand(cmd);
        if (result.ok) {
          captured = true;
          break;
        }
        lastError = result.stderr;
      }
    } else if (displayServer === "wayland") {
      const result = await tryCommand(["grim", SCREENSHOT_PATH]);
      if (result.ok) captured = true;
      else lastError = result.stderr;
    }

    if (!captured) {
      throw new Error(
        `Failed to capture screenshot on ${displayServer}. Last error: ${lastError}. Install maim/scrot (X11) or grim (Wayland).`,
      );
    }

    const file = Bun.file(SCREENSHOT_PATH);
    const exists = await file.exists();
    if (!exists) {
      throw new Error("Screenshot file was not created");
    }

    const buffer = await file.arrayBuffer();
    const size = buffer.byteLength;
    const base64 = Buffer.from(buffer).toString("base64");

    let width = 0;
    let height = 0;
    try {
      const identifyProc = Bun.spawn(["identify", "-format", "%w %h", SCREENSHOT_PATH], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const identifyExit = await identifyProc.exited;
      if (identifyExit === 0) {
        const out = await new Response(identifyProc.stdout).text();
        const parts = out.trim().split(" ");
        width = parseInt(parts[0], 10) || 0;
        height = parseInt(parts[1], 10) || 0;
      }
    } catch {}

    return [
      {
        json: {
          filename: SCREENSHOT_PATH,
          width,
          height,
        },
        binary: {
          screenshot: {
            $artifact: "pending",
            mime: "image/png",
            size,
            name: "screenshot.png",
          },
        },
      },
    ];
  },

  async simulate(_ctx: RunContext<ScreenshotParams>): Promise<SimulationReport> {
    return {
      description: "Screenshot",
      wouldDo: "would capture screen",
    };
  },
};

nodeRegistry.register(definition);
