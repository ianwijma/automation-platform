import { describe, test, expect, beforeEach } from "bun:test";
import { createDatabase, AppDatabase } from "../db/database.js";
import { CredentialVault } from "./credential-vault.js";

describe("CredentialVault", () => {
  let db: AppDatabase;
  let vault: CredentialVault;

  beforeEach(() => {
    db = createDatabase(":memory:");
    vault = new CredentialVault(db);
  });

  test("store and retrieve credential", () => {
    const id = vault.storeCredential("my-api-key", "api_key", {
      keyId: "abc123",
      keySecret: "s3cret!",
    });

    const cred = vault.getCredential(id);
    expect(cred.name).toBe("my-api-key");
    expect(cred.type).toBe("api_key");
    expect(cred.values.keyId).toBe("abc123");
    expect(cred.values.keySecret).toBe("s3cret!");
  });

  test("list credentials has no values", () => {
    vault.storeCredential("cred1", "api_key", { key: "val1" });
    vault.storeCredential("cred2", "password", { user: "admin" });

    const list = vault.listCredentials();
    expect(list.length).toBe(2);
    expect(list[0]).toHaveProperty("id");
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("type");
    expect(list[0]).toHaveProperty("createdAt");
    expect((list[0] as any).values).toBeUndefined();
    expect((list[1] as any).values).toBeUndefined();
  });

  test("delete credential", () => {
    const id = vault.storeCredential("to-delete", "api_key", { key: "val" });
    expect(vault.deleteCredential(id)).toBe(true);
    expect(() => vault.getCredential(id)).toThrow();
  });

  test("delete non-existent credential returns false", () => {
    expect(vault.deleteCredential("nonexistent")).toBe(false);
  });

  test("get credential by name", () => {
    vault.storeCredential("named-cred", "password", { user: "admin", pass: "secret" });

    const cred = vault.getCredentialByName("named-cred");
    expect(cred).not.toBeNull();
    expect(cred!.name).toBe("named-cred");
    expect(cred!.values.user).toBe("admin");
    expect(cred!.values.pass).toBe("secret");
  });

  test("get credential by name returns null if not found", () => {
    const cred = vault.getCredentialByName("nonexistent");
    expect(cred).toBeNull();
  });

  test("update credential re-encrypts values", () => {
    const id = vault.storeCredential("updatable", "api_key", { key: "old" });
    vault.updateCredential(id, { key: "new" });

    const cred = vault.getCredential(id);
    expect(cred.values.key).toBe("new");
  });

  test("credential vault uses instance key from settings", () => {
    const id1 = vault.storeCredential("test1", "api_key", { k: "v1" });

    const vault2 = new CredentialVault(db);
    const cred = vault2.getCredential(id1);
    expect(cred.values.k).toBe("v1");
  });

  test("storing credential with duplicate name throws", () => {
    vault.storeCredential("unique-name", "api_key", { k: "v1" });
    expect(() => {
      vault.storeCredential("unique-name", "api_key", { k: "v2" });
    }).toThrow();
  });
});
