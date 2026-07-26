import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { safeSpawn, spawnAndCapture } from "../core/safe-spawn.js";

interface ImageDetectParams {
  template: string;
  confidence: number;
  method: string;
}

const definition: NodeDefinition<ImageDetectParams> = {
  type: "vision.image.detect",
  version: 1,
  displayName: "Image Detect",
  category: "vision",
  sideEffecting: false,
  requiredCapabilities: { screen: true },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    template: { type: "string", description: "Path to template image" },
    confidence: { type: "number", default: 0.8, description: "Minimum confidence threshold (0-1)" },
    method: { type: "string", default: "template-matching", description: "Detection method" },
  },

  async run(ctx: RunContext<ImageDetectParams>): Promise<NodeItem[]> {
    const { template } = ctx.params;
    const confidence = ctx.params.confidence ?? 0.8;
    const screenshotItem = ctx.items.find((item) => item.json?.filename);
    const screenshotPath = (screenshotItem?.json?.filename as string) ?? "/tmp/ap_screenshot.png";

    let compareAvailable = false;
    try {
      const checkProc = await safeSpawn({ cmd: ["which", "compare"] });
      compareAvailable = (await checkProc.exited) === 0;
    } catch {}

    if (!compareAvailable) {
      throw new Error("ImageMagick 'compare' command not found. Install imagemagick: apt install imagemagick");
    }

    const { stderr: compareStderr } = await spawnAndCapture({
      cmd: ["compare", "-metric", "RMSE", screenshotPath, template, "null:"],
    });

    const rmseMatch = compareStderr.match(/([\d.]+)/);
    const rmseValue = rmseMatch ? parseFloat(rmseMatch[1]) : 1;

    const normalizedError = Math.min(rmseValue, 1);
    const matchConfidence = 1 - normalizedError;

    const found = matchConfidence >= confidence;

    return [
      {
        json: {
          found,
          confidence: matchConfidence,
          location: null,
        },
      },
    ];
  },

  async simulate(ctx: RunContext<ImageDetectParams>): Promise<SimulationReport> {
    return {
      description: "Image Detect",
      wouldDo: `would detect image at confidence ${ctx.params.confidence}`,
    };
  },
};

nodeRegistry.register(definition);
