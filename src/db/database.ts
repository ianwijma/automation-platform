import { chmodSync } from "node:fs";
import initialSchema from "./migrations/001_initial.sql" with { type: "text" };
import { Database as BunDatabase } from "bun:sqlite";

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "001_initial.sql",
    sql: initialSchema,
  },
  {
    name: "002_artifacts_created_at.sql",
    sql: `ALTER TABLE artifacts ADD COLUMN created_at TEXT; UPDATE artifacts SET created_at = datetime('now') WHERE created_at IS NULL;`,
  },
  {
    name: "003_durable_execution.sql",
    sql: `
ALTER TABLE runs ADD COLUMN record_json TEXT;
ALTER TABLE node_executions ADD COLUMN record_json TEXT;
ALTER TABLE agents ADD COLUMN identity_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS agent_identity ON agents(identity_hash) WHERE identity_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS runs_automation_started ON runs(automation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS executions_run ON node_executions(run_id);
CREATE UNIQUE INDEX IF NOT EXISTS env_scope_key ON env_vars(scope, COALESCE(scope_id, ''), key);
CREATE TABLE IF NOT EXISTS trigger_cursors (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`,
  },
];

const ENSURE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT DEFAULT (datetime('now'))
);
`;

export class AppDatabase {
  readonly db: BunDatabase;

  constructor(
    db: BunDatabase,
    readonly path: string = db.filename,
  ) {
    this.db = db;
  }

  close(): void {
    this.db.close();
  }
}

export function createDatabase(path: string): AppDatabase {
  const sqlite = new BunDatabase(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  sqlite.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  sqlite.exec(ENSURE_MIGRATIONS_TABLE);

  const applied = new Set(
    sqlite
      .query<{ name: string }, []>("SELECT name FROM _migrations")
      .all()
      .map((r) => r.name),
  );

  const pending = MIGRATIONS.filter((m) => !applied.has(m.name));

  if (pending.length > 0) {
    const insertMigration = sqlite.prepare(
      "INSERT INTO _migrations (name) VALUES (?)",
    );

    sqlite.transaction(() => {
      for (const migration of pending) {
        sqlite.exec(migration.sql);
        insertMigration.run(migration.name);
      }
    })();
  }

  return new AppDatabase(sqlite, path);
}
