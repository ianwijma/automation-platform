import type { Database } from "bun:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  encryptData,
  decryptData,
  encryptForStorage,
  decryptFromStorage,
} from "./crypto.js";
const memoryKeys = new WeakMap<Database, Buffer>();
export function instanceKey(db: Database): Buffer {
  const file = db.filename;
  if (!file || file === ":memory:") {
    if (!memoryKeys.has(db)) memoryKeys.set(db, randomBytes(32));
    return memoryKeys.get(db)!;
  }
  const path = `${file}.key`;
  const passphrase = process.env.AP_MASTER_KEY;
  if (!existsSync(path)) {
    // Never silently replace a legacy key: the old profile remains recoverable.
    if (db.query("SELECT 1 FROM settings WHERE key='instance_key'").get())
      throw new Error(
        "Legacy vault profile detected. Use a new AP_DATA_DIR; retain the old profile for recovery.",
      );
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const key = randomBytes(32),
      salt = randomBytes(16);
    const stored = passphrase
      ? {
          version: 1,
          salt: salt.toString("hex"),
          ...encryptData(key.toString("hex"), scryptSync(passphrase, salt, 32)),
        }
      : { version: 1, key: key.toString("hex") };
    writeFileSync(path, JSON.stringify(stored), { mode: 0o600, flag: "wx" });
  }
  if ((statSync(path).mode & 0o077) !== 0)
    throw new Error("Vault key file must have mode 0600");
  const stored = JSON.parse(readFileSync(path, "utf8"));
  if (stored.salt) {
    if (!passphrase)
      throw new Error("AP_MASTER_KEY is required to unlock this vault");
    return Buffer.from(
      decryptData(
        stored.encrypted,
        stored.iv,
        stored.tag,
        scryptSync(passphrase, Buffer.from(stored.salt, "hex"), 32),
      ),
      "hex",
    );
  }
  if (passphrase)
    throw new Error(
      "This vault is not passphrase protected; create a new profile with AP_MASTER_KEY set",
    );
  if (!/^[a-f0-9]{64}$/.test(stored.key))
    throw new Error("Invalid vault key file");
  return Buffer.from(stored.key, "hex");
}
export function sealSecret(db: Database, value: string): string {
  return `enc:v1:${encryptForStorage(value, instanceKey(db))}`;
}
export function openSecret(db: Database, value: string): string {
  if (!value.startsWith("enc:v1:"))
    throw new Error(
      "Unencrypted legacy secret detected; re-enter it in a fresh profile",
    );
  return decryptFromStorage(value.slice(7), instanceKey(db));
}
