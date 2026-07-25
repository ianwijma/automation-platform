import { readdirSync, cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir);
const OUT_DIR = resolve(ROOT, "dist");
const UI_DIST = resolve(ROOT, "ui/dist");
const BINARY_OUT = resolve(ROOT, "ap");

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

if (existsSync(UI_DIST)) {
  cpSync(UI_DIST, join(OUT_DIR, "ui"), { recursive: true });
} else {
  console.warn("Warning: ui/dist/ not found. Run `cd ui && npm run build` first.");
}

console.log("Compiling single binary...");
const result = spawnSync(
  "bun",
  ["build", "--compile", "./src/main.ts", "--outfile", BINARY_OUT],
  { cwd: ROOT, stdio: "inherit" },
);

if (result.status === 0) {
  console.log(`Binary: ${BINARY_OUT}`);
} else {
  console.warn("Single-binary compilation failed. Check bun version >= 1.0.");
  process.exit(1);
}
