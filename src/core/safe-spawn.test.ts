import { describe, test, expect } from "bun:test";
import { safeSpawn, spawnAndCapture } from "./safe-spawn.js";

describe("safeSpawn", () => {
  test("throws helpful error for missing binary", async () => {
    await expect(safeSpawn({ cmd: ["nonexistent-tool-xyz"] })).rejects.toThrow(
      "nonexistent-tool-xyz is not installed",
    );
  });

  test("error message includes tool name", async () => {
    try {
      await safeSpawn({ cmd: ["nonexistent-tool-xyz"] });
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("nonexistent-tool-xyz");
      expect((err as Error).message).toContain("not installed");
    }
  });

  test("works for existing binaries", async () => {
    const proc = await safeSpawn({ cmd: ["echo", "hello"] });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });
});

describe("spawnAndCapture", () => {
  test("captures stdout", async () => {
    const { exitCode, stdout } = await spawnAndCapture({ cmd: ["echo", "test-output"] });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("test-output");
  });

  test("captures stderr and non-zero exit", async () => {
    const { exitCode, stderr } = await spawnAndCapture({ cmd: ["ls", "/nonexistent-dir-xyz"] });
    expect(exitCode).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
  });

  test("throws helpful error for missing binary", async () => {
    await expect(spawnAndCapture({ cmd: ["nonexistent-tool-xyz"] })).rejects.toThrow(
      "nonexistent-tool-xyz is not installed",
    );
  });
});
