import { Database as BunDatabase } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS_DIR = resolve(import.meta.dir, "migrations");

const ENSURE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT (datetime('now'))
);
`;

export class AppDatabase {
  readonly db: BunDatabase;

  constructor(db: BunDatabase) {
    this.db = db;
  }

  close(): void {
    this.db.close();
  }
}

export function createDatabase(path: string): AppDatabase {
  const sqlite = new BunDatabase(path);
  sqlite.exec("PRAGMA journal_mode=WAL;");
  sqlite.exec(ENSURE_MIGRATIONS_TABLE);

  const applied = new Set(
    sqlite
      .query<{ name: string }, []>("SELECT name FROM _migrations")
      .all()
      .map((r) => r.name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length > 0) {
    const insertMigration = sqlite.prepare(
      "INSERT INTO _migrations (name) VALUES (?)",
    );

    sqlite.transaction(() => {
      for (const file of pending) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
        sqlite.exec(sql);
        insertMigration.run(file);
      }
    })();
  }

  return new AppDatabase(sqlite);
}
