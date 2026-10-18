import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
declare const AP_EMBEDDED_ASSETS: Record<string, string> | undefined;
const assets: Record<string, string> =
  typeof AP_EMBEDDED_ASSETS === "undefined" ? {} : AP_EMBEDDED_ASSETS;
export function bundledFile(path: string): Uint8Array | undefined {
  const data = assets[path];
  return data === undefined ? undefined : Buffer.from(data, "base64");
}
export function installBundledHelper(dataDir: string): void {
  const bytes = bundledFile("runtime/ap-desktop-bridge");
  if (!bytes) return;
  const hash = createHash("sha256")
    .update(bytes)
    .update(assets["runtime/ocr-worker.cjs"] ?? "")
    .update(assets["runtime/eng.traineddata.gz"] ?? "")
    .digest("hex")
    .slice(0, 16);
  const directory = join(dataDir, "runtime", hash);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "ap-desktop-bridge");
  if (!existsSync(path)) {
    writeFileSync(path, bytes, { mode: 0o700, flag: "wx" });
    chmodSync(path, 0o700);
  }
  process.env.AP_DESKTOP_BRIDGE ??= path;
  for (const name of ["ocr-worker.cjs", "eng.traineddata.gz"]) {
    const data = bundledFile(`runtime/${name}`);
    const output = join(directory, name);
    if (data && !existsSync(output))
      writeFileSync(output, data, { mode: 0o600, flag: "wx" });
  }
  process.env.AP_OCR_RUNTIME ??= directory;
}
