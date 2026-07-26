import type { Database } from "bun:sqlite";
import type { AppDatabase } from "../db/database.js";
import type { CredentialVault } from "../core/credential-vault.js";
import type { EnvResolver } from "../core/env-resolver.js";
import type { AutomationDefinition, AutomationTarget } from "../core/types.js";
import type { ExportResponse, ImportRequest } from "../core/api-types.js";
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

interface EnvVarRow {
  scope: string;
  scope_id: string | null;
  key: string;
  value: string;
  is_secret: number;
}

interface AgentRow {
  id: string;
  name: string;
  tags_json: string;
}

export function exportAutomation(
  db: Database,
  automationId: string,
): ExportResponse | null {
  const automation = db
    .query<AutomationRow, [string]>("SELECT * FROM automations WHERE id = ?")
    .get(automationId);
  if (!automation) return null;

  let definition: AutomationDefinition | null = null;
  if (automation.active_version_id) {
    const version = db
      .query<VersionRow, [string]>("SELECT * FROM automation_versions WHERE id = ?")
      .get(automation.active_version_id);
    if (version) definition = JSON.parse(version.definition_json);
  }
  if (!definition && automation.draft_json) {
    definition = JSON.parse(automation.draft_json);
  }
  if (!definition) return null;

  const credentialRefs = new Map<string, { type: string; name: string }>();
  for (const node of definition.nodes) {
    if (node.credentials) {
      const key = `${node.credentials.type}:${node.credentials.name}`;
      credentialRefs.set(key, { type: node.credentials.type, name: node.credentials.name });
    }
  }
  const credentials = [...credentialRefs.values()];

  const envRows = db
    .query<EnvVarRow, [string]>(
      "SELECT * FROM env_vars WHERE scope = 'automation' AND scope_id = ?",
    )
    .all(automationId);
  const envVars = envRows.map((r) => ({
    scope: r.scope,
    scopeId: r.scope_id,
    key: r.key,
    isSecret: r.is_secret === 1,
  }));

  const agentMapping: Record<string, string[]> = {};
  const agents = db.query<AgentRow, []>("SELECT id, name, tags_json FROM agents").all();
  for (const node of definition.nodes) {
    if (node.target.kind === "machine" && node.target.value) {
      const matchingAgents = agents.filter((a) => a.id === node.target.value);
      if (matchingAgents.length > 0) {
        const agent = matchingAgents[0];
        agentMapping[node.target.value] = [agent.name, ...JSON.parse(agent.tags_json) as string[]];
      }
    }
  }

  return { automation: definition, credentials, envVars, agentMapping };
}

export function importAutomation(
  db: AppDatabase,
  vault: CredentialVault,
  envResolver: EnvResolver,
  data: ImportRequest,
): string {
  const definition = { ...data.automation };

  if (data.targetRebinding) {
    definition.nodes = definition.nodes.map((node) => {
      if (node.id in data.targetRebinding!) {
        return { ...node, target: data.targetRebinding![node.id] };
      }
      return node;
    });
  }

  const automationId = randomUUID();
  const now = new Date().toISOString();
  const versionId = randomUUID();
  const draftJson = JSON.stringify(definition);
  const settingsJson = JSON.stringify(definition.settings);

  db.db.transaction(() => {
    db.db
      .prepare(
        "INSERT INTO automations (id, name, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(automationId, definition.name, draftJson, settingsJson, now, now);
    db.db
      .prepare(
        "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(versionId, automationId, 1, draftJson, now);
  })();

  for (const [credKey, credData] of Object.entries(data.credentials)) {
    const existing = vault.getCredentialByName(credKey);
    if (!existing) {
      vault.storeCredential(credKey, credData.type, { value: credData.value });
    }
  }

  for (const [envKey, envData] of Object.entries(data.envVars)) {
    envResolver.setVar("automation", automationId, envKey, envData.value, envData.isSecret);
  }

  return automationId;
}
