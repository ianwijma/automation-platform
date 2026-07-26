import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ArtifactStore } from "./artifacts.js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  name TEXT NOT NULL,
  created_run_id TEXT REFERENCES runs(id),
  expires_at TEXT NOT NULL
);
`;

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return db;
}

describe("ArtifactStore", () => {
  let store: ArtifactStore;
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = `/tmp/ap-test-artifacts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mkdirSync(tmpDir, { recursive: true });
    db = createTestDb();
    store = new ArtifactStore(tmpDir, db);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("storeArtifact and getArtifact round-trip", () => {
    const data = Buffer.from("hello world");
    const meta = store.storeArtifact(data, "text/plain", "test.txt", "run-1");

    expect(meta.id).toBeDefined();
    expect(meta.size).toBe(data.length);
    expect(meta.mime).toBe("text/plain");
    expect(meta.name).toBe("test.txt");
    expect(meta.runId).toBe("run-1");

    const result = store.getArtifact(meta.id);
    expect(result).not.toBeNull();
    expect(result!.data.toString()).toBe("hello world");
    expect(result!.meta.id).toBe(meta.id);
  });

  test("content-addressed storage: same content produces same ID", () => {
    const data1 = Buffer.from("same content");
    const data2 = Buffer.from("same content");

    const meta1 = store.storeArtifact(data1, "text/plain", "a.txt", "run-1");
    const meta2 = store.storeArtifact(data2, "text/plain", "b.txt", "run-2");

    expect(meta1.id).toBe(meta2.id);
  });

  test("different content produces different IDs", () => {
    const data1 = Buffer.from("content A");
    const data2 = Buffer.from("content B");

    const meta1 = store.storeArtifact(data1, "text/plain", "a.txt", "run-1");
    const meta2 = store.storeArtifact(data2, "text/plain", "b.txt", "run-2");

    expect(meta1.id).not.toBe(meta2.id);
  });

  test("getArtifact returns null for non-existent ID", () => {
    expect(store.getArtifact("nonexistent0000")).toBeNull();
  });

  test("getArtifactMeta returns metadata without data", () => {
    const data = Buffer.from("metadata test");
    const meta = store.storeArtifact(data, "application/json", "data.json", "run-1");

    const metaOnly = store.getArtifactMeta(meta.id);
    expect(metaOnly).not.toBeNull();
    expect(metaOnly!.id).toBe(meta.id);
    expect(metaOnly!.mime).toBe("application/json");
  });

  test("getArtifactMeta returns null for non-existent", () => {
    expect(store.getArtifactMeta("nonexistent")).toBeNull();
  });

  test("cleanupExpired removes expired artifacts", () => {
    const data = Buffer.from("expiring soon");
    const meta = store.storeArtifact(data, "text/plain", "expire.txt", "run-1", 0);

    const past = new Date(Date.now() - 1000).toISOString();
    db.prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?").run(past, meta.id);

    const deleted = store.cleanupExpired();
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(store.getArtifact(meta.id)).toBeNull();
  });

  test("cleanupExpired does not remove non-expired artifacts", () => {
    const data = Buffer.from("staying alive");
    const meta = store.storeArtifact(data, "text/plain", "keep.txt", "run-1", 720);

    const deleted = store.cleanupExpired();
    expect(store.getArtifact(meta.id)).not.toBeNull();
  });

  test("storeArtifactStream delegates to storeArtifact", () => {
    const data = Buffer.from("stream data");
    const meta = store.storeArtifactStream(data, "text/plain", "stream.txt", "run-1");
    expect(meta).toBeDefined();
    expect(meta.size).toBe(data.length);
    const result = store.getArtifact(meta.id);
    expect(result!.data.toString()).toBe("stream data");
  });
});
