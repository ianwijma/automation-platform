import { Database as BunDatabase } from "bun:sqlite";

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: "001_initial.sql",
    sql: `
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_version_id TEXT,
  draft_json TEXT,
  settings_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_versions (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id),
  version_no INTEGER NOT NULL,
  definition_json TEXT NOT NULL,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_local INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT DEFAULT '[]',
  capabilities_json TEXT DEFAULT '{}',
  version TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen_at TEXT,
  enrolled_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id),
  version_id TEXT REFERENCES automation_versions(id),
  mode TEXT NOT NULL CHECK(mode IN ('manual','trigger','dry','partial')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','success','error','interrupted','cancelled')),
  trigger_json TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS node_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  node_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('success','error','timeout','cancelled','interrupted','queued','running')),
  attempt INTEGER NOT NULL DEFAULT 0,
  simulated INTEGER NOT NULL DEFAULT 0,
  input_json TEXT,
  input_artifact TEXT,
  output_json TEXT,
  output_artifact TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  duration_ms INTEGER,
  error_json TEXT
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  name TEXT NOT NULL,
  created_run_id TEXT REFERENCES runs(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  enc_blob TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS env_vars (
  scope TEXT NOT NULL CHECK(scope IN ('global','automation','machine')),
  scope_id TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(scope, scope_id, key)
);

CREATE TABLE IF NOT EXISTS state (
  automation_id TEXT NOT NULL REFERENCES automations(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(automation_id, key)
);

CREATE TABLE IF NOT EXISTS join_tokens (
  token_hash TEXT PRIMARY KEY,
  uses_left INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
  {
    name: "002_artifacts_created_at.sql",
    sql: `ALTER TABLE artifacts ADD COLUMN created_at TEXT DEFAULT (datetime('now'));`,
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

  return new AppDatabase(sqlite);
}
