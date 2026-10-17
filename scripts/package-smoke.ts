import { mkdtempSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const archive = resolve(
  process.argv[2] ??
    "desktop/src-tauri/target/release/bundle/deb/Automation Platform_0.1.0_amd64.deb",
);
const directory = mkdtempSync("/tmp/ap-package-smoke-");
try {
  const unpack = Bun.spawn(["dpkg-deb", "--extract", archive, directory], {
    stdout: "ignore",
    stderr: "inherit",
  });
  if (await unpack.exited) throw new Error("Package extraction failed");
  const files = [
    ...new Bun.Glob("**/resources/ap.gz").scanSync({
      cwd: directory,
      absolute: true,
    }),
  ];
  if (files.length !== 1)
    throw new Error("Expected exactly one bundled runtime resource");
  const bytes = Bun.gunzipSync(readFileSync(files[0]));
  const hash = (data: Uint8Array) =>
    createHash("sha256").update(data).digest("hex");
  if (hash(bytes) !== hash(readFileSync("dist/ap")))
    throw new Error("Packaging changed the Bun executable payload");
  const executable = join(directory, "ap");
  await Bun.write(executable, bytes);
  chmodSync(executable, 0o700);
  const smoke = Bun.spawn(
    [
      "bun",
      "run",
      "scripts/portable-smoke.ts",
      executable,
      "scripts/fixtures/ocr.png",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (await smoke.exited) throw new Error("Packaged runtime smoke failed");
  console.log(
    "Debian package passed: exact embedded executable preserved and runnable with offline OCR.",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
