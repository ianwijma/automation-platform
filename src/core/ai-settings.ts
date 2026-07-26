import type { Database } from "bun:sqlite";

interface SettingRow {
  key: string;
  value: string;
}

export function getAiSettings(db: Database): {
  apiKey: string | null;
  model: string;
  endpoint: string | null;
} {
  const rows = db
    .query<SettingRow, [string, string, string]>(
      "SELECT key, value FROM settings WHERE key IN (?, ?, ?)",
    )
    .all("ai_api_key", "ai_model", "ai_endpoint");

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }

  return {
    apiKey: map.get("ai_api_key") ?? null,
    model: map.get("ai_model") ?? "openai/gpt-4o-mini",
    endpoint: map.get("ai_endpoint") ?? null,
  };
}

export function setAiSettings(
  db: Database,
  settings: { apiKey?: string; model?: string; endpoint?: string },
): void {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  const entries: Array<[string, string]> = [];
  if (settings.apiKey !== undefined) entries.push(["ai_api_key", settings.apiKey]);
  if (settings.model !== undefined) entries.push(["ai_model", settings.model]);
  if (settings.endpoint !== undefined) entries.push(["ai_endpoint", settings.endpoint]);

  if (entries.length === 0) return;

  db.transaction(() => {
    for (const [key, value] of entries) {
      upsert.run(key, value);
    }
  })();
}
