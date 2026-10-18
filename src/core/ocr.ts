import { Worker } from "node:worker_threads";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { executionSignal } from "./cancellation.js";

export async function recognizeOffline(
  image: Uint8Array,
  lang = "eng",
  signal = executionSignal.getStore(),
): Promise<{ text: string; confidence: number }> {
  const runtime = process.env.AP_OCR_RUNTIME;
  const workerPath = runtime
    ? join(runtime, "ocr-worker.cjs")
    : resolve(import.meta.dir, "../../dist/ocr-worker.cjs");
  const langPath =
    process.env.AP_OCR_LANG_PATH ??
    (runtime
      ? runtime
      : resolve(
          import.meta.dir,
          "../../node_modules/@tesseract.js-data/eng/4.0.0",
        ));
  if (!/^[a-z_]+(?:\+[a-z_]+)*$/.test(lang))
    throw new Error("Invalid OCR language");
  for (const name of lang.split("+"))
    if (!existsSync(join(langPath, `${name}.traineddata.gz`)))
      throw new Error(`OCR language ${name} is not installed in ${langPath}`);
  if (!existsSync(workerPath))
    throw new Error("Build the offline OCR worker with bun run scripts/ocr.ts");
  signal?.throwIfAborted();
  const worker = new Worker(workerPath);
  let counter = 0;
  let rejectPending: ((error: Error) => void) | undefined;
  const abort = () => {
    rejectPending?.(signal?.reason ?? new Error("OCR cancelled"));
    void worker.terminate();
  };
  signal?.addEventListener("abort", abort, { once: true });
  async function call(action: string, payload: unknown): Promise<any> {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const jobId = String(++counter);
      const cleanup = () => {
        worker.removeListener("message", message);
        worker.removeListener("error", failure);
        worker.removeListener("exit", exited);
        rejectPending = undefined;
      };
      const failure = (error: Error) => {
        cleanup();
        reject(error);
      };
      const exited = () =>
        failure(new Error("OCR worker exited before completing"));
      const message = (packet: {
        jobId: string;
        status: string;
        data: any;
      }) => {
        if (packet.jobId !== jobId || packet.status === "progress") return;
        cleanup();
        if (packet.status === "resolve") resolve(packet.data);
        else reject(new Error(String(packet.data)));
      };
      rejectPending = failure;
      worker.on("message", message);
      worker.once("error", failure);
      worker.once("exit", exited);
      worker.postMessage({ workerId: "ocr", jobId, action, payload });
    });
  }
  try {
    await call("load", { options: { lstmOnly: true, logging: false } });
    await call("loadLanguage", {
      langs: lang,
      options: { langPath, gzip: true, cacheMethod: "none", lstmOnly: true },
    });
    await call("initialize", { langs: lang, oem: 1, config: {} });
    const data = await call("recognize", {
      image,
      options: {},
      output: { text: true },
    });
    return { text: data.text, confidence: data.confidence };
  } finally {
    signal?.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
