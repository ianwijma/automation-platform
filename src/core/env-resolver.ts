import { sealSecret, openSecret } from "./secret-store.js";
import type { AppDatabase } from "../db/database.js";
import type { CredentialVault } from "./credential-vault.js";

interface EnvVarRow {
  scope: string;
  scope_id: string | null;
  key: string;
  value: string;
  is_secret: number;
}

export class EnvResolver {
  private db: AppDatabase;
  private vault: CredentialVault | null;

  private stmtInsert: any;
  private stmtUpdate: any;
  private stmtSelectNull: any;
  private stmtSelectNonNull: any;
  private stmtDeleteNull: any;
  private stmtDeleteNonNull: any;
  private stmtSelectScopeNull: any;
  private stmtSelectScopeNonNull: any;
  private stmtSelectScopeOnly: any;
  private stmtSelectAll: any;

  constructor(db: AppDatabase, vault?: CredentialVault) {
    this.db = db;
    this.vault = vault ?? null;

    this.stmtInsert = this.db.db.prepare(
      "INSERT INTO env_vars (scope, scope_id, key, value, is_secret) VALUES (?, ?, ?, ?, ?)",
    );
    this.stmtUpdate = this.db.db.prepare(
      "UPDATE env_vars SET value = ?, is_secret = ? WHERE scope = ? AND scope_id IS ? AND key = ?",
    );
    this.stmtSelectNull = this.db.db.prepare(
      "SELECT * FROM env_vars WHERE scope = ? AND scope_id IS NULL AND key = ?",
    );
    this.stmtSelectNonNull = this.db.db.prepare(
      "SELECT * FROM env_vars WHERE scope = ? AND scope_id = ? AND key = ?",
    );
    this.stmtDeleteNull = this.db.db.prepare(
      "DELETE FROM env_vars WHERE scope = ? AND scope_id IS NULL AND key = ?",
    );
    this.stmtDeleteNonNull = this.db.db.prepare(
      "DELETE FROM env_vars WHERE scope = ? AND scope_id = ? AND key = ?",
    );
    this.stmtSelectScopeNull = this.db.db.prepare(
      "SELECT * FROM env_vars WHERE scope = ? AND scope_id IS NULL ORDER BY key",
    );
    this.stmtSelectScopeNonNull = this.db.db.prepare(
      "SELECT * FROM env_vars WHERE scope = ? AND scope_id = ? ORDER BY key",
    );
    this.stmtSelectScopeOnly = this.db.db.prepare(
      "SELECT * FROM env_vars WHERE scope = ? ORDER BY scope_id, key",
    );
    this.stmtSelectAll = this.db.db.prepare(
      "SELECT * FROM env_vars ORDER BY scope, scope_id, key",
    );
  }

  private selectRow(
    scope: string,
    scopeId: string | null,
    key: string,
  ): EnvVarRow | undefined {
    if (scopeId === null) {
      return this.stmtSelectNull.get(scope, key) as EnvVarRow | undefined;
    }
    return this.stmtSelectNonNull.get(scope, scopeId, key) as
      | EnvVarRow
      | undefined;
  }

  setVar(
    scope: "global" | "automation" | "machine",
    scopeId: string | null,
    key: string,
    value: string,
    isSecret: boolean,
  ): void {
    if (!["global", "automation", "machine"].includes(scope))
      throw new Error("Invalid environment scope");
    if (scope !== "global" && !scopeId) throw new Error("Scope ID required");
    if (typeof value !== "string")
      throw new Error("Environment value must be a string");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      throw new Error("Invalid environment variable name");
    if (scope === "global") scopeId = null;
    if (isSecret) value = sealSecret(this.db.db, value);
    const existing = this.selectRow(scope, scopeId, key);

    if (existing) {
      if (scopeId === null) {
        this.stmtUpdate.run(value, isSecret ? 1 : 0, scope, null, key);
      } else {
        this.stmtUpdate.run(value, isSecret ? 1 : 0, scope, scopeId, key);
      }
    } else {
      this.stmtInsert.run(scope, scopeId, key, value, isSecret ? 1 : 0);
    }
  }

  getVar(
    scope: "global" | "automation" | "machine",
    scopeId: string | null,
    key: string,
  ): string | undefined {
    const row = this.selectRow(scope, scopeId, key);
    if (!row) return undefined;
    if (row.is_secret) return this.resolveSecretValue(row.value);
    return row.value;
  }

  listVars(
    scope?: string,
    scopeId?: string | null,
  ): Array<{
    scope: string;
    scopeId: string | null;
    key: string;
    value?: string;
    isSecret: boolean;
  }> {
    let rows: EnvVarRow[];

    if (scope && scopeId !== undefined) {
      if (scopeId === null) {
        rows = this.stmtSelectScopeNull.all(scope) as EnvVarRow[];
      } else {
        rows = this.stmtSelectScopeNonNull.all(scope, scopeId) as EnvVarRow[];
      }
    } else if (scope) {
      rows = this.stmtSelectScopeOnly.all(scope) as EnvVarRow[];
    } else {
      rows = this.stmtSelectAll.all() as EnvVarRow[];
    }

    return rows.map((r) => ({
      scope: r.scope,
      scopeId: r.scope_id,
      key: r.key,
      value: r.is_secret ? undefined : r.value,
      isSecret: r.is_secret === 1,
    }));
  }

  deleteVar(scope: string, scopeId: string | null, key: string): boolean {
    const existing = this.selectRow(scope, scopeId, key);
    if (!existing) return false;

    if (scopeId === null) {
      this.stmtDeleteNull.run(scope, key);
    } else {
      this.stmtDeleteNonNull.run(scope, scopeId, key);
    }
    return true;
  }

  resolveForExecution(
    agentId: string,
    automationId: string,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    const globalRows = this.db.db
      .query<EnvVarRow, [string]>("SELECT * FROM env_vars WHERE scope = ?")
      .all("global");
    for (const row of globalRows) {
      result[row.key] = row.is_secret
        ? this.resolveSecretValue(row.value)
        : row.value;
    }

    const automationRows = this.db.db
      .query<
        EnvVarRow,
        [string, string]
      >("SELECT * FROM env_vars WHERE scope = ? AND scope_id = ?")
      .all("automation", automationId);
    for (const row of automationRows) {
      result[row.key] = row.is_secret
        ? this.resolveSecretValue(row.value)
        : row.value;
    }

    const machineRows = this.db.db
      .query<
        EnvVarRow,
        [string, string]
      >("SELECT * FROM env_vars WHERE scope = ? AND scope_id = ?")
      .all("machine", agentId);
    for (const row of machineRows) {
      result[row.key] = row.is_secret
        ? this.resolveSecretValue(row.value)
        : row.value;
    }

    return result;
  }

  private resolveSecretValue(value: string): string {
    value = openSecret(this.db.db, value);
    let ref: { credentialId?: string; key?: string };
    try {
      ref = JSON.parse(value);
    } catch {
      return value;
    }
    if (!ref || !ref.credentialId || !ref.key) return value;
    if (!this.vault) throw new Error("Vault unavailable");
    const credential = this.vault.getCredential(ref.credentialId);
    if (!(ref.key in credential.values))
      throw new Error("Credential field not found");
    return credential.values[ref.key];
  }
}
