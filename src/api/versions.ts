import type { Database } from "bun:sqlite";
import type { AutomationVersionResponse, AutomationResponse } from "../core/api-types.js";
import { updateAutomation } from "./automations.js";

interface VersionRow {
  id: string;
  automation_id: string;
  version_no: number;
  definition_json: string;
  label: string | null;
  created_at: string;
}

function parseVersionRow(row: VersionRow): AutomationVersionResponse {
  return {
    id: row.id,
    automationId: row.automation_id,
    versionNo: row.version_no,
    definition: JSON.parse(row.definition_json),
    label: row.label,
    createdAt: row.created_at,
  };
}

export function listVersions(db: Database, automationId: string): AutomationVersionResponse[] {
  const rows = db
    .query<VersionRow, [string]>(
      "SELECT * FROM automation_versions WHERE automation_id = ? ORDER BY version_no DESC",
    )
    .all(automationId);
  return rows.map(parseVersionRow);
}

export function getVersion(
  db: Database,
  automationId: string,
  versionNo: number,
): AutomationVersionResponse | null {
  const row = db
    .query<VersionRow, [string, number]>(
      "SELECT * FROM automation_versions WHERE automation_id = ? AND version_no = ?",
    )
    .get(automationId, versionNo);
  if (!row) return null;
  return parseVersionRow(row);
}

export function revertToVersion(
  db: Database,
  automationId: string,
  versionNo: number,
): AutomationResponse | null {
  const version = getVersion(db, automationId, versionNo);
  if (!version) return null;
  return updateAutomation(db, automationId, version.definition);
}

export function labelVersion(db: Database, versionId: string, label: string): boolean {
  const existing = db
    .query<{ id: string }, [string]>("SELECT id FROM automation_versions WHERE id = ?")
    .get(versionId);
  if (!existing) return false;
  db.prepare("UPDATE automation_versions SET label = ? WHERE id = ?").run(label, versionId);
  return true;
}
