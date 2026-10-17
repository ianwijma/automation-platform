import { readdirSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
const root = import.meta.dir;
async function run(args: string[], cwd = root) {
  const proc = Bun.spawn(args, { cwd, stdout: "inherit", stderr: "inherit" });
  if (await proc.exited) throw new Error(`Build failed: ${args.join(" ")}`);
}
await run(["bun", "run", "build:ui"]);
await run(["bun", "run", "scripts/ocr.ts"]);
await run([
  "cargo",
  "build",
  "--release",
  "--locked",
  "--manifest-path",
  "desktop/bridge/Cargo.toml",
]);
const assets: Record<string, string> = {};
const ui = resolve(root, "ui/dist");
function collect(path: string) {
  for (const name of readdirSync(path)) {
    const file = join(path, name);
    if (statSync(file).isDirectory()) collect(file);
    else
      assets[`ui/${relative(ui, file)}`] =
        readFileSync(file).toString("base64");
  }
}
collect(ui);
assets["runtime/ap-desktop-bridge"] = readFileSync(
  join(root, "desktop/bridge/target/release/ap-desktop-bridge"),
).toString("base64");
mkdirSync(join(root, "dist"), { recursive: true });
assets["runtime/ocr-worker.cjs"] = readFileSync(
  join(root, "dist/ocr-worker.cjs"),
).toString("base64");
assets["runtime/eng.traineddata.gz"] = readFileSync(
  join(root, "node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz"),
).toString("base64");
const output = join(root, "dist/ap");
const result = await Bun.build({
  entrypoints: [join(root, "src/main.ts")],
  target: "bun",
  compile: { outfile: output },
  define: { AP_EMBEDDED_ASSETS: JSON.stringify(assets) },
});
if (!result.success)
  throw new AggregateError(result.logs, "Executable compilation failed");
if (process.argv.includes("--desktop")) {
  // linuxdeploy's ELF rewriting corrupts Bun's embedded executable payload.
  // Package compressed bytes as a resource and extract them unchanged at launch.
  const resources = join(root, "desktop/src-tauri/resources");
  mkdirSync(resources, { recursive: true });
  await Bun.write(join(resources, "ap.gz"), Bun.gzipSync(readFileSync(output)));
}
console.log(`Portable executable: ${output}`);
