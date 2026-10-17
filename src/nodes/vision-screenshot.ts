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

interface ScreenshotParams {
  display?: "current" | "select";
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
    display: {
      type: "string",
      default: "current",
      description: "Display to capture",
    },
  },

  async run(ctx: RunContext<ScreenshotParams>): Promise<NodeItem[]> {
    if (!ctx.artifacts) throw new Error("Artifact storage unavailable");
    const dir = mkdtempSync(join(tmpdir(), "ap-capture-"));
    const path = join(dir, "capture.png");
    try {
      await captureDesktop(path, ctx.actionTarget);
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
    _ctx: RunContext<ScreenshotParams>,
  ): Promise<SimulationReport> {
    return {
      description: "Screenshot",
      wouldDo: "would capture screen",
    };
  },
};

nodeRegistry.register(definition);
