import { captureDesktop } from "../core/desktop-driver.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface WindowScreenshotParams {
  windowId?: string;
  pid?: number;
  title?: string;
  activateFirst?: boolean;
  delayMs?: number;
}

const definition: NodeDefinition<WindowScreenshotParams> = {
  type: "vision.window.screenshot",
  version: 1,
  displayName: "Window Screenshot",
  category: "vision",
  icon: "🖼️",
  sideEffecting: true,
  requiredCapabilities: { screen: true },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    windowId: {
      type: "string",
      default: "",
      description: "Hex window ID (e.g. 0x05600004)",
    },
    pid: {
      type: "number",
      default: 0,
      description: "Filter by process ID (0 = use windowId instead)",
    },
    title: {
      type: "string",
      default: "",
      description: "Regex to find window by title",
    },
    activateFirst: {
      type: "boolean",
      default: true,
      description: "Activate window before capture",
    },
    delayMs: {
      type: "number",
      default: 200,
      description: "Delay after activation in ms",
    },
  },

  async run(ctx: RunContext<WindowScreenshotParams>): Promise<NodeItem[]> {
    if (!ctx.artifacts) throw new Error("Artifact storage unavailable");
    const dir = mkdtempSync(join(tmpdir(), "ap-capture-"));
    const path = join(dir, "capture.png");
    try {
      await captureDesktop(
        path,
        ctx.actionTarget ?? {
          kind: "window" as const,
          windowId: ctx.params.windowId,
          windowTitle: ctx.params.title,
          pid: ctx.params.pid,
        },
      );
      const bytes = await Bun.file(path).arrayBuffer();
      const ref = await ctx.artifacts.store(
        bytes,
        "image/png",
        "screenshot.png",
      );
      const png = Buffer.from(bytes);
      return [
        {
          json: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
          binary: { screenshot: ref },
        },
      ];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  async simulate(
    _ctx: RunContext<WindowScreenshotParams>,
  ): Promise<SimulationReport> {
    return {
      description: "Window Screenshot",
      wouldDo: "would capture screenshot of window",
    };
  },
};

nodeRegistry.register(definition);
