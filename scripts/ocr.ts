import { mkdirSync } from "node:fs";
mkdirSync("dist", { recursive: true });
const result = await Bun.build({
  entrypoints: ["src/core/ocr-worker.ts"],
  target: "bun",
  format: "cjs",
  outdir: "dist",
  naming: "ocr-worker.cjs",
});
if (!result.success)
  throw new AggregateError(result.logs, "OCR worker build failed");
