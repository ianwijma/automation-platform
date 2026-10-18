import { describe, test, expect } from "bun:test";
import { createDatabase } from "./database.js";

const PLAN_TABLES = [
  "automations",
  "automation_versions",
  "agents",
  "runs",
  "node_executions",
  "artifacts",
  "credentials",
  "env_vars",
  "state",
  "join_tokens",
  "settings",
];

function tableNames(db: ReturnType<typeof createDatabase>["db"]): string[] {
  const rows = db
    .query<
      { name: string },
      []
    >("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  return rows.map((r) => r.name);
}

describe("database migration system", () => {
  test("in-memory database creates all plan tables", () => {
    const db = createDatabase(":memory:");
    const tables = tableNames(db.db);

    for (const t of PLAN_TABLES) {
      expect(tables).toContain(t);
    }

    db.close();
  });

  test("_migrations table records applied migrations", () => {
    const db = createDatabase(":memory:");
    const rows = db.db
      .query<
        { id: number; name: string; applied_at: string },
        []
      >("SELECT id, name, applied_at FROM _migrations ORDER BY id")
      .all();

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].name).toBe("001_initial.sql");
    expect(rows[0].applied_at).toBeTruthy();

    db.close();
  });

  test("migrations are idempotent — re-running does not duplicate entries", () => {
    const db = createDatabase(":memory:");

    const before = db.db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM _migrations")
      .get()!;

    db.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    const after = db.db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM _migrations")
      .get()!;

    expect(after.count).toBe(before.count);

    db.close();
  });

  test("all plan tables plus _migrations exist after migration", () => {
    const db = createDatabase(":memory:");
    const tables = tableNames(db.db);

    const expected = [...PLAN_TABLES, "_migrations", "trigger_cursors"].sort();
    expect(tables.sort()).toEqual(expected);

    db.close();
  });
});
