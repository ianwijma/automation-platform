import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { exportAutomation, importAutomation } from "./export-import.js";
import { AppDatabase, createDatabase } from "../db/database.js";
import { CredentialVault } from "../core/credential-vault.js";
import { EnvResolver } from "../core/env-resolver.js";

function makeDefinition() {
  return {
    schemaVersion: 1 as const,
    name: "Test Export",
    settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
    nodes: [
      {
        id: "node-1",
        type: "trigger.manual",
        typeVersion: 1,
        name: "Manual Trigger",
        target: { kind: "local" as const },
        params: {},
        disabled: false,
        position: { x: 100, y: 100 },
      },
    ],
    edges: [],
  };
}

function createTestAppDb(): AppDatabase {
  return createDatabase(":memory:");
}

function insertAutomationForExport(db: Database, id: string, def: ReturnType<typeof makeDefinition>) {
  const now = new Date().toISOString();
  const defJson = JSON.stringify(def);
  const versionId = "v-" + id;
  db.prepare(
    "INSERT INTO automations (id, name, active_version_id, draft_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, def.name, versionId, defJson, JSON.stringify(def.settings), now, now);
  db.prepare(
    "INSERT INTO automation_versions (id, automation_id, version_no, definition_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(versionId, id, 1, defJson, now);
}

describe("exportAutomation", () => {
  let appDb: AppDatabase;

  beforeEach(() => {
    appDb = createTestAppDb();
  });

  test("returns null for non-existent automation", () => {
    expect(exportAutomation(appDb.db, "no-such-id")).toBeNull();
  });

  test("exports automation definition without secret values", () => {
    const def = makeDefinition();
    insertAutomationForExport(appDb.db, "auto-1", def);
    const result = exportAutomation(appDb.db, "auto-1");
    expect(result).not.toBeNull();
    expect(result!.automation.name).toBe("Test Export");
    expect(result!.automation.nodes).toHaveLength(1);
    expect(result!.credentials).toBeInstanceOf(Array);
    expect(result!.envVars).toBeInstanceOf(Array);
    expect(result!.agentMapping).toBeDefined();
  });

  test("exports credentials refs from nodes with credentials", () => {
    const def = {
      ...makeDefinition(),
      nodes: [
        {
          id: "node-1",
          type: "action.http",
          typeVersion: 1,
          name: "HTTP Request",
          target: { kind: "local" as const },
          params: { url: "https://api.example.com" },
          credentials: { type: "api_key", name: "my-api-key" },
          disabled: false,
          position: { x: 100, y: 100 },
        },
      ],
    };
    insertAutomationForExport(appDb.db, "auto-2", def);
    const result = exportAutomation(appDb.db, "auto-2");
    expect(result).not.toBeNull();
    expect(result!.credentials).toHaveLength(1);
    expect(result!.credentials[0].name).toBe("my-api-key");
  });
});

describe("importAutomation", () => {
  let appDb: AppDatabase;
  let vault: CredentialVault;
  let envResolver: EnvResolver;

  beforeEach(() => {
    appDb = createTestAppDb();
    vault = new CredentialVault(appDb);
    envResolver = new EnvResolver(appDb, vault);
  });

  test("creates new automation from import data", () => {
    const def = makeDefinition();
    const automationId = importAutomation(appDb, vault, envResolver, {
      automation: def,
      credentials: {},
      envVars: {},
    });
    expect(automationId).toBeDefined();
    expect(typeof automationId).toBe("string");

    const row = appDb.db.query<{ name: string }, [string]>(
      "SELECT name FROM automations WHERE id = ?"
    ).get(automationId);
    expect(row).not.toBeNull();
    expect(row!.name).toBe("Test Export");
  });

  test("target rebinding during import", () => {
    const def: any = {
      ...makeDefinition(),
      nodes: [
        {
          id: "node-1",
          type: "action.shell",
          typeVersion: 1,
          name: "Shell",
          target: { kind: "machine", value: "old-agent" },
          params: { command: "ls" },
          disabled: false,
          position: { x: 0, y: 0 },
        },
      ],
    };

    const automationId = importAutomation(appDb, vault, envResolver, {
      automation: def,
      credentials: {},
      envVars: {},
      targetRebinding: {
        "node-1": { kind: "local" as const },
      },
    });

    const row = appDb.db.query<{ draft_json: string }, [string]>(
      "SELECT draft_json FROM automations WHERE id = ?"
    ).get(automationId);
    const imported = JSON.parse(row!.draft_json);
    expect(imported.nodes[0].target.kind).toBe("local");
  });

  test("stores credentials during import", () => {
    const def = makeDefinition();
    importAutomation(appDb, vault, envResolver, {
      automation: def,
      credentials: { "imported-key": { type: "api_key", value: "secret-value" } },
      envVars: {},
    });

    const cred = vault.getCredentialByName("imported-key");
    expect(cred).not.toBeNull();
    expect(cred!.values.value).toBe("secret-value");
    expect(cred!.type).toBe("api_key");
  });

  test("sets env vars during import", () => {
    const def = makeDefinition();
    const automationId = importAutomation(appDb, vault, envResolver, {
      automation: def,
      credentials: {},
      envVars: { MY_VAR: { value: "hello", isSecret: false } },
    });

    const val = envResolver.getVar("automation", automationId, "MY_VAR");
    expect(val).toBe("hello");
  });
});
