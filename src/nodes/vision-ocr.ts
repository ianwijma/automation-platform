import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
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
    const { imagePath } = ctx.params;
    const lang = ctx.params.lang ?? "eng";
    const engine = ctx.params.engine ?? "tesseract";

    if (engine === "tesseract") {
      const { exitCode, stdout, stderr } = await spawnAndCapture({
        cmd: ["tesseract", imagePath, "stdout", "-l", lang],
      });

      if (exitCode !== 0) {
        throw new Error(`Tesseract failed (exit ${exitCode}): ${stderr}`);
      }

      const confidenceMatch = stderr.match(/(\d+)\s*$/m);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 0;

      return [
        {
          json: {
            text: stdout,
            confidence,
            lang,
          },
        },
      ];
    }

    if (engine === "wasm") {
      try {
        // @ts-expect-error optional dependency
      const tesseractjs = await import("tesseract.js");
        const worker = await tesseractjs.createWorker(lang);
        const { data } = await worker.recognize(imagePath);
        await worker.terminate();
        return [
          {
            json: {
              text: data.text,
              confidence: data.confidence,
              lang,
            },
          },
        ];
      } catch {
        throw new Error("tesseract.js is not installed. Run: bun add tesseract.js");
      }
    }

    throw new Error(`Unknown OCR engine: ${engine}`);
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
