import { withImage } from "../core/image-input.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { spawnAndCapture } from "../core/safe-spawn.js";

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
  requiredCapabilities: { tools: ["compare"] },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    template: { type: "string", description: "Path to template image" },
    confidence: {
      type: "number",
      default: 0.8,
      description: "Minimum confidence threshold (0-1)",
    },
    method: {
      type: "string",
      default: "template-matching",
      description: "Detection method",
    },
  },

  async run(ctx: RunContext<ImageDetectParams>): Promise<NodeItem[]> {
    const confidence = ctx.params.confidence ?? 0.8;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
      throw new Error("Confidence must be between 0 and 1");
    if (ctx.params.method && ctx.params.method !== "template-matching")
      throw new Error("Only template-matching is supported");
    return withImage(ctx, undefined, (screenshot) =>
      withImage(ctx, ctx.params.template, async (template) => {
        const result = await spawnAndCapture({
          cmd: [
            "compare",
            "-limit",
            "thread",
            "2",
            "-limit",
            "memory",
            "128MiB",
            "-limit",
            "map",
            "256MiB",
            "-metric",
            "NCC",
            "-subimage-search",
            screenshot,
            template,
            "null:",
          ],
        });
        if (result.exitCode > 1)
          throw new Error(`Image comparison failed: ${result.stderr}`);
        const match = result.stderr.match(
          /([-+\d.eE]+)(?:\s+\([^)]+\))?\s+@\s+(-?\d+),(-?\d+)/,
        );
        if (!match)
          throw new Error(
            `ImageMagick did not return a match location: ${result.stderr}`,
          );
        const score = Number(match[1]);
        return [
          {
            json: {
              found: score >= confidence,
              confidence: score,
              location: { x: Number(match[2]), y: Number(match[3]) },
            },
          },
        ];
      }),
    );
  },

  async simulate(
    ctx: RunContext<ImageDetectParams>,
  ): Promise<SimulationReport> {
    return {
      description: "Image Detect",
      wouldDo: `would detect image at confidence ${ctx.params.confidence}`,
    };
  },
};

nodeRegistry.register(definition);
