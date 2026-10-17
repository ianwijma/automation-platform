import { instanceKey } from "./secret-store.js";
import type { AppDatabase } from "../db/database.js";
import {
  generateInstanceKey,
  encryptForStorage,
  decryptFromStorage,
  encryptData,
  decryptData,
} from "./crypto.js";
import { randomUUID } from "node:crypto";

interface CredentialRow {
  id: string;
  name: string;
  type: string;
  enc_blob: string;
  created_at: string;
}

interface SettingRow {
  key: string;
  value: string;
}

export class CredentialVault {
  private db: AppDatabase;
  private instanceKey: Buffer | null = null;

  constructor(db: AppDatabase) {
    this.db = db;
  }

  private loadInstanceKey(): Buffer {
    return instanceKey(this.db.db);
  }

  storeCredential(
    name: string,
    type: string,
    values: Record<string, string>,
  ): string {
    if (!name?.trim() || !type?.trim())
      throw new Error("Credential name and type required");
    validateValues(values);
    const key = this.loadInstanceKey();
    const id = randomUUID();
    const encBlob = encryptForStorage(JSON.stringify(values), key);

    this.db.db
      .prepare(
        "INSERT INTO credentials (id, name, type, enc_blob) VALUES (?, ?, ?, ?)",
      )
      .run(id, name, type, encBlob);

    return id;
  }

  getCredential(id: string): {
    name: string;
    type: string;
    values: Record<string, string>;
  } {
    const key = this.loadInstanceKey();
    const row = this.db.db
      .query<CredentialRow, [string]>("SELECT * FROM credentials WHERE id = ?")
      .get(id);
    if (!row) throw new Error(`Credential not found: ${id}`);

    const values = JSON.parse(decryptFromStorage(row.enc_blob, key)) as Record<
      string,
      string
    >;
    return { name: row.name, type: row.type, values };
  }

  getCredentialByName(name: string): {
    id: string;
    name: string;
    type: string;
    values: Record<string, string>;
  } | null {
    const key = this.loadInstanceKey();
    const row = this.db.db
      .query<
        CredentialRow,
        [string]
      >("SELECT * FROM credentials WHERE name = ?")
      .get(name);
    if (!row) return null;

    const values = JSON.parse(decryptFromStorage(row.enc_blob, key)) as Record<
      string,
      string
    >;
    return { id: row.id, name: row.name, type: row.type, values };
  }

  getMetadata(id: string): {
    id: string;
    name: string;
    type: string;
    createdAt: string;
  } {
    const entry = this.listCredentials().find((c) => c.id === id);
    if (!entry) throw new Error("Credential not found");
    return entry;
  }

  listCredentials(): Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
  }> {
    const rows = this.db.db
      .query<
        CredentialRow,
        []
      >("SELECT id, name, type, created_at FROM credentials ORDER BY created_at DESC")
      .all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      createdAt: r.created_at,
    }));
  }

  deleteCredential(id: string): boolean {
    const row = this.db.db
      .query<CredentialRow, [string]>("SELECT id FROM credentials WHERE id = ?")
      .get(id);
    if (!row) return false;

    this.db.db.prepare("DELETE FROM credentials WHERE id = ?").run(id);
    return true;
  }

  updateCredential(id: string, values: Record<string, string>): void {
    const key = this.loadInstanceKey();
    const encBlob = encryptForStorage(JSON.stringify(values), key);
    this.db.db
      .prepare("UPDATE credentials SET enc_blob = ? WHERE id = ?")
      .run(encBlob, id);
  }
}

function validateValues(values: Record<string, string>): void {
  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    Object.values(values).some((value) => typeof value !== "string")
  )
    throw new Error("Credential fields must be strings");
}
