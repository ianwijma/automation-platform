import type { RunContext, ArtifactRef } from "./node-contract.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
export async function imageBytes(
  ctx: RunContext,
  input?: unknown,
): Promise<{ data: Uint8Array; mime: string }> {
  let ref =
    input && typeof input === "object" && "$artifact" in input
      ? (input as ArtifactRef)
      : undefined;
  if (!input)
    ref = ctx.items
      .flatMap((item) => Object.values(item.binary ?? {}))
      .find((ref) => ref.mime.startsWith("image/"));
  if (ref) {
    if (!ctx.artifacts?.read) throw new Error("Artifact reading unavailable");
    return { data: await ctx.artifacts.read(ref), mime: ref.mime };
  }
  if (typeof input !== "string" || !input)
    throw new Error("Connect an image artifact or specify imagePath");
  const file = Bun.file(input);
  if (!(await file.exists())) throw new Error(`Image not found: ${input}`);
  if (file.size > 32 * 1024 * 1024) throw new Error("Image too large");
  return {
    data: new Uint8Array(await file.arrayBuffer()),
    mime: file.type || "image/png",
  };
}
export async function withImage<T>(
  ctx: RunContext,
  input: unknown,
  use: (path: string) => Promise<T>,
): Promise<T> {
  const image = await imageBytes(ctx, input),
    dir = mkdtempSync(join(tmpdir(), "ap-image-")),
    path = join(dir, "image");
  try {
    await Bun.write(path, image.data);
    return await use(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
