import type { AppDatabase } from "../db/database.js";
import { generateInstanceKey, encryptForStorage, decryptFromStorage, encryptData, decryptData } from "./crypto.js";
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
    if (this.instanceKey) return this.instanceKey;

    const row = this.db.db
      .query<SettingRow, [string]>("SELECT value FROM settings WHERE key = ?")
      .get("instance_key");

    if (row) {
      const masterKeyEnv = process.env.AP_MASTER_KEY;
      if (masterKeyEnv) {
        const masterKey = Buffer.from(masterKeyEnv, "hex");
        try {
          const wrapped = JSON.parse(row.value) as { encrypted: string; iv: string; tag: string };
          const decryptedHex = decryptData(wrapped.encrypted, wrapped.iv, wrapped.tag, masterKey);
          this.instanceKey = Buffer.from(decryptedHex, "hex");
        } catch {
          this.instanceKey = Buffer.from(row.value, "hex");
        }
      } else {
        this.instanceKey = Buffer.from(row.value, "hex");
      }
    } else {
      const newKey = generateInstanceKey();
      const masterKeyEnv = process.env.AP_MASTER_KEY;
      let storedValue: string;
      if (masterKeyEnv) {
        const masterKey = Buffer.from(masterKeyEnv, "hex");
        const { encrypted, iv, tag } = encryptData(newKey.toString("hex"), masterKey);
        storedValue = JSON.stringify({ encrypted, iv, tag });
      } else {
        storedValue = newKey.toString("hex");
      }
      this.db.db
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .run("instance_key", storedValue);
      this.instanceKey = newKey;
    }

    return this.instanceKey;
  }

  storeCredential(
    name: string,
    type: string,
    values: Record<string, string>,
  ): string {
    const key = this.loadInstanceKey();
    const id = randomUUID();
    const encBlob = encryptForStorage(JSON.stringify(values), key);

    this.db.db
      .prepare("INSERT INTO credentials (id, name, type, enc_blob) VALUES (?, ?, ?, ?)")
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

    const values = JSON.parse(decryptFromStorage(row.enc_blob, key)) as Record<string, string>;
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
      .query<CredentialRow, [string]>("SELECT * FROM credentials WHERE name = ?")
      .get(name);
    if (!row) return null;

    const values = JSON.parse(decryptFromStorage(row.enc_blob, key)) as Record<string, string>;
    return { id: row.id, name: row.name, type: row.type, values };
  }

  listCredentials(): Array<{ id: string; name: string; type: string; createdAt: string }> {
    const rows = this.db.db
      .query<CredentialRow, []>("SELECT id, name, type, created_at FROM credentials ORDER BY created_at DESC")
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

  updateCredential(
    id: string,
    values: Record<string, string>,
  ): void {
    const key = this.loadInstanceKey();
    const encBlob = encryptForStorage(JSON.stringify(values), key);
    this.db.db
      .prepare("UPDATE credentials SET enc_blob = ? WHERE id = ?")
      .run(encBlob, id);
  }
}
