// The worker protocol is pinned with tesseract.js 7. Keep it isolated and terminate
// the whole worker on cancellation, including model loading and WASM execution.
import { parentPort } from "node:worker_threads";
import { readFile, writeFile, unlink, access } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const worker = require("tesseract.js/src/worker-script");
const core = require("tesseract.js-core/tesseract-core-lstm.wasm.js");
worker.setAdapter({
  getCore: async () => core,
  gunzip: gunzipSync,
  fetch: async () => {
    throw new Error("OCR language data must be installed locally");
  },
  readCache: readFile,
  writeCache: writeFile,
  deleteCache: (path: string) => unlink(path).catch(() => {}),
  checkCache: (path: string) =>
    access(path)
      .then(() => true)
      .catch(() => false),
});
parentPort!.on("message", (packet) =>
  worker.dispatchHandlers(packet, (result: unknown) =>
    parentPort!.postMessage(result),
  ),
);
