import { recognizeOffline } from "../core/ocr.js";
import { imageBytes, withImage } from "../core/image-input.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { spawnAndCapture } from "../core/safe-spawn.js";

interface OcrParams {
  imagePath: string;
  lang: string;
  engine?: "tesseract" | "wasm";
}

const definition: NodeDefinition<OcrParams> = {
  type: "vision.ocr",
  version: 1,
  displayName: "OCR",
  category: "vision",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    imagePath: { type: "string", description: "Path to image file" },
    lang: { type: "string", default: "eng", description: "OCR language" },
    engine: { type: "string", description: "OCR engine: tesseract or wasm" },
  },

  async run(ctx: RunContext<OcrParams>): Promise<NodeItem[]> {
    const lang = ctx.params.lang || "eng";
    if (ctx.params.engine === "wasm" || !Bun.which("tesseract")) {
      const image = await imageBytes(ctx, ctx.params.imagePath);
      return [
        {
          json: {
            ...(await recognizeOffline(image.data, lang, ctx.signal)),
            lang,
            engine: "wasm",
          },
        },
      ];
    }
    return withImage(ctx, ctx.params.imagePath, async (imagePath) => {
      const result = await spawnAndCapture({
        cmd: ["tesseract", imagePath, "stdout", "-l", lang, "tsv"],
      });
      if (result.exitCode !== 0)
        throw new Error(`Tesseract failed: ${result.stderr}`);
      const words = result.stdout
        .split("\n")
        .slice(1)
        .map((line) => line.split("\t"))
        .filter((c) => c.length >= 12 && Number(c[10]) >= 0 && c[11]?.trim());
      const text = words.map((c) => c.slice(11).join("\t")).join(" ");
      const confidence = words.length
        ? words.reduce((sum, c) => sum + Number(c[10]), 0) / words.length
        : 0;
      return [{ json: { text, confidence, lang } }];
    });
  },

  async simulate(ctx: RunContext<OcrParams>): Promise<SimulationReport> {
    const engine = ctx.params.engine ?? "tesseract";
    const lang = ctx.params.lang ?? "eng";
    return {
      description: "OCR",
      wouldDo: `would OCR image with ${engine} (lang: ${lang})`,
    };
  },
};

nodeRegistry.register(definition);
