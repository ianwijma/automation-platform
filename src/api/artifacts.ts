import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { Database } from "bun:sqlite";

interface ArtifactMeta {
  id: string;
  size: number;
  mime: string;
  name: string;
  runId: string;
  expiresAt: string;
  createdAt: string;
}

interface ArtifactRecord {
  id: string;
  size: number;
  mime: string;
  name: string;
  created_run_id: string;
  expires_at: string;
  created_at: string;
}

export class ArtifactStore {
  private dataDir: string;
  private db: Database;

  constructor(dataDir: string, db: Database) {
    this.dataDir = dataDir;
    this.db = db;

    const artifactsDir = join(dataDir, "artifacts");
    mkdirSync(artifactsDir, { recursive: true, mode: 0o700 });
  }

  storeArtifact(
    data: Buffer,
    mime: string,
    name: string,
    runId: string,
    ttlHours = 72,
  ): ArtifactMeta {
    if (!Number.isFinite(ttlHours) || ttlHours <= 0 || ttlHours > 8760)
      throw new Error("Invalid artifact retention");
    if (data.byteLength > 32 * 1024 * 1024)
      throw new Error("Artifact exceeds 32 MiB");
    const sha256 = createHash("sha256").update(data).digest("hex");
    const prefix = sha256.slice(0, 2);
    const dir = join(this.dataDir, "artifacts", prefix);
    mkdirSync(dir, { recursive: true, mode: 0o700 });

    const filePath = join(dir, sha256);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, data, { mode: 0o600 });
    }

    const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
    const now = new Date().toISOString();

    this.db
      .prepare(
        "INSERT INTO artifacts (id, size, mime, name, created_run_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET expires_at=MAX(artifacts.expires_at,excluded.expires_at)",
      )
      .run(sha256, data.length, mime, name, runId, expiresAt, now);

    return {
      id: sha256,
      size: data.length,
      mime,
      name,
      runId,
      expiresAt,
      createdAt: now,
    };
  }

  getArtifact(id: string): { data: Buffer; meta: ArtifactMeta } | null {
    if (!/^[a-f0-9]{64}$/.test(id)) return null;
    const meta = this.getArtifactMeta(id);
    if (!meta) return null;

    const prefix = id.slice(0, 2);
    const filePath = join(this.dataDir, "artifacts", prefix, id);

    if (!existsSync(filePath)) return null;

    const data = readFileSync(filePath);
    return { data, meta };
  }

  getArtifactMeta(id: string): ArtifactMeta | null {
    const row = this.db
      .query<ArtifactRecord, [string]>("SELECT * FROM artifacts WHERE id = ?")
      .get(id);

    if (!row || row.expires_at <= new Date().toISOString()) return null;

    return {
      id: row.id,
      size: row.size,
      mime: row.mime,
      name: row.name,
      runId: row.created_run_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  cleanupExpired(): number {
    const now = new Date().toISOString();
    const expired = this.db
      .query<
        ArtifactRecord,
        [string]
      >("SELECT * FROM artifacts WHERE expires_at <= ?")
      .all(now);

    let deleted = 0;
    for (const row of expired) {
      const prefix = row.id.slice(0, 2);
      const filePath = join(this.dataDir, "artifacts", prefix, row.id);
      const thumbPath = join(
        this.dataDir,
        "artifacts",
        prefix,
        `${row.id}.thumb`,
      );

      try {
        if (existsSync(filePath)) unlinkSync(filePath);
        if (existsSync(thumbPath)) unlinkSync(thumbPath);
      } catch {}

      this.db.prepare("DELETE FROM artifacts WHERE id = ?").run(row.id);
      deleted++;
    }

    return deleted;
  }

  private generateThumbnail(
    filePath: string,
    sha256: string,
    mime: string,
    prefix: string,
  ): void {
    if (!mime.startsWith("image/")) return;

    const thumbPath = join(
      this.dataDir,
      "artifacts",
      prefix,
      `${sha256}.thumb`,
    );
    if (existsSync(thumbPath)) return;

    try {
      const proc = Bun.spawn({
        cmd: [
          "convert",
          filePath,
          "-resize",
          "200x200>",
          "-quality",
          "80",
          thumbPath,
        ],
        stdout: "pipe",
        stderr: "pipe",
      });
      proc.exited.catch(() => {});
    } catch {}
  }

  storeArtifactStream(
    data: Buffer,
    mime: string,
    name: string,
    runId: string,
    ttlHours?: number,
  ): ArtifactMeta {
    return this.storeArtifact(data, mime, name, runId, ttlHours);
  }
}
