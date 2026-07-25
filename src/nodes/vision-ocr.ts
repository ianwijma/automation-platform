import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

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
    const { imagePath, lang, engine } = ctx.params;
    const effectiveEngine = engine ?? "tesseract";

    if (effectiveEngine === "tesseract") {
      const proc = Bun.spawn(["tesseract", imagePath, "stdout", "-l", lang], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

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

    if (effectiveEngine === "wasm") {
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

    throw new Error(`Unknown OCR engine: ${effectiveEngine}`);
  },

  async simulate(ctx: RunContext<OcrParams>): Promise<SimulationReport> {
    const engine = ctx.params.engine ?? "tesseract";
    return {
      description: "OCR",
      wouldDo: `would OCR image with ${engine}`,
    };
  },
};

nodeRegistry.register(definition);
