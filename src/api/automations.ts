import type { Database } from "bun:sqlite";
import type { AutomationDefinition, AutomationSettings } from "../core/types.js";
import type { AutomationResponse } from "../core/api-types.js";
import { randomUUID } from "node:crypto";

interface AutomationRow {
  id: string;
  name: string;
  active_version_id: string | null;
  draft_json: string | null;
  settings_json: string | null;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  automation_id: string;
  version_no: number;
  definition_json: string;
  label: string | null;
  created_at: string;
}

function parseAutomationRow(row: AutomationRow, definition: AutomationDefinition | null): AutomationResponse {
  return {
    id: row.id,
    name: row.name,
    activeVersionId: row.active_version_id,
    settings: row.settings_json ? JSON.parse(row.settings_json) : { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
    draft: definition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAutomation(
  db: Database,
  name: string,
  definition: AutomationDefinition,
): AutomationResponse {
  const id = randomUUID();
  const now = new Date().toISOString();
  const versionId = randomUUID();
  const draftJson = JSON.stringify(definition);
  const settingsJson = JSON.stringify(definition.settings);

  const insertAutomation = db.prepare(
    "INSERT INTO automations (id, name, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertVersion = db.prepare(
    "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  db.transaction(() => {
    insertAutomation.run(id, name, draftJson, settingsJson, now, now);
    insertVersion.run(versionId, id, 1, draftJson, now);
  })();

  const row = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(id);
  if (!row) throw new Error("Failed to create automation");

  return parseAutomationRow(row, definition);
}

export function getAutomation(db: Database, id: string): AutomationResponse | null {
  const row = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(id);
  if (!row) return null;

  let definition: AutomationDefinition | null = null;

  if (row.active_version_id) {
    const version = db.query<VersionRow, [string]>("SELECT * FROM automation_versions WHERE id = ?").get(row.active_version_id);
    if (version) {
      definition = JSON.parse(version.definition_json);
    }
  }

  if (!definition && row.draft_json) {
    definition = JSON.parse(row.draft_json);
  }

  return parseAutomationRow(row, definition);
}

export function listAutomations(db: Database): AutomationResponse[] {
  const rows = db.query<AutomationRow, []>("SELECT * FROM automations ORDER BY created_at DESC").all();
  return rows.map((row) => {
    let definition: AutomationDefinition | null = null;
    if (row.draft_json) {
      definition = JSON.parse(row.draft_json);
    }
    return parseAutomationRow(row, definition);
  });
}

export function updateAutomation(
  db: Database,
  id: string,
  definition: AutomationDefinition,
): AutomationResponse | null {
  const existing = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const draftJson = JSON.stringify(definition);
  const settingsJson = JSON.stringify(definition.settings);

  const maxVersion = db.query<{ version_no: number }, [string]>(
    "SELECT COALESCE(MAX(version_no), 0) as version_no FROM automation_versions WHERE automation_id = ?",
  ).get(id);

  const nextVersionNo = (maxVersion?.version_no ?? 0) + 1;
  const versionId = randomUUID();

  const updateAutomation = db.prepare(
    "UPDATE automations SET draft_json = ?, settings_json = ?, updated_at = ? WHERE id = ?",
  );
  const insertVersion = db.prepare(
    "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  db.transaction(() => {
    updateAutomation.run(draftJson, settingsJson, now, id);
    insertVersion.run(versionId, id, nextVersionNo, draftJson, now);
  })();

  const row = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(id);
  if (!row) return null;

  return parseAutomationRow(row, definition);
}

export function deleteAutomation(db: Database, id: string): boolean {
  const existing = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(id);
  if (!existing) return false;

  const deleteVersions = db.prepare("DELETE FROM automation_versions WHERE automation_id = ?");
  const deleteAutomation = db.prepare("DELETE FROM automations WHERE id = ?");

  db.transaction(() => {
    deleteVersions.run(id);
    deleteAutomation.run(id);
  })();

  return true;
}

export function activateAutomation(db: Database, id: string): AutomationResponse | null {
  const existing = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(id);
  if (!existing) return null;

  const latestVersion = db.query<VersionRow, [string]>(
    "SELECT * FROM automation_versions WHERE automation_id = ? ORDER BY version_no DESC LIMIT 1",
  ).get(id);

  if (!latestVersion) return null;

  const now = new Date().toISOString();
  db.prepare("UPDATE automations SET active_version_id = ?, updated_at = ? WHERE id = ?").run(
    latestVersion.id, now, id,
  );

  return getAutomation(db, id);
}

export function deactivateAutomation(db: Database, id: string): AutomationResponse | null {
  const existing = db.query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?").get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare("UPDATE automations SET active_version_id = NULL, updated_at = ? WHERE id = ?").run(now, id);

  return getAutomation(db, id);
}
