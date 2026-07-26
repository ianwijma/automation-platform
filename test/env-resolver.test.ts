import { describe, test, expect, beforeEach } from "bun:test";
import { createDatabase, AppDatabase } from "../src/db/database.js";
import { EnvResolver } from "../src/core/env-resolver.js";
import { CredentialVault } from "../src/core/credential-vault.js";

describe("EnvResolver", () => {
  let db: AppDatabase;
  let resolver: EnvResolver;

  beforeEach(() => {
    db = createDatabase(":memory:");
    resolver = new EnvResolver(db);
  });

  test("set and get at global scope", () => {
    resolver.setVar("global", null, "APP_NAME", "AutomationPlatform", false);
    expect(resolver.getVar("global", null, "APP_NAME")).toBe("AutomationPlatform");
  });

  test("set and get at automation scope", () => {
    resolver.setVar("automation", "auto-1", "API_URL", "https://api.example.com", false);
    expect(resolver.getVar("automation", "auto-1", "API_URL")).toBe("https://api.example.com");
  });

  test("set and get at machine scope", () => {
    resolver.setVar("machine", "agent-1", "HOSTNAME", "worker-01", false);
    expect(resolver.getVar("machine", "agent-1", "HOSTNAME")).toBe("worker-01");
  });

  test("getVar returns undefined for non-existent key", () => {
    expect(resolver.getVar("global", null, "NONEXISTENT")).toBeUndefined();
  });

  test("precedence: machine > automation > global", () => {
    resolver.setVar("global", null, "DB_HOST", "global-db", false);
    resolver.setVar("automation", "auto-1", "DB_HOST", "automation-db", false);
    resolver.setVar("machine", "agent-1", "DB_HOST", "machine-db", false);

    const env = resolver.resolveForExecution("agent-1", "auto-1");
    expect(env.DB_HOST).toBe("machine-db");
  });

  test("precedence: automation > global when no machine override", () => {
    resolver.setVar("global", null, "DB_HOST", "global-db", false);
    resolver.setVar("automation", "auto-1", "DB_HOST", "automation-db", false);

    const env = resolver.resolveForExecution("agent-1", "auto-1");
    expect(env.DB_HOST).toBe("automation-db");
  });

  test("precedence: global only when no overrides", () => {
    resolver.setVar("global", null, "DB_HOST", "global-db", false);

    const env = resolver.resolveForExecution("agent-1", "auto-1");
    expect(env.DB_HOST).toBe("global-db");
  });

  test("resolveForExecution merges correctly", () => {
    resolver.setVar("global", null, "APP_NAME", "Platform", false);
    resolver.setVar("global", null, "LOG_LEVEL", "info", false);
    resolver.setVar("automation", "auto-1", "LOG_LEVEL", "debug", false);
    resolver.setVar("automation", "auto-1", "API_URL", "https://api.example.com", false);
    resolver.setVar("machine", "agent-1", "NODE_ID", "worker-01", false);

    const env = resolver.resolveForExecution("agent-1", "auto-1");
    expect(env.APP_NAME).toBe("Platform");
    expect(env.LOG_LEVEL).toBe("debug");
    expect(env.API_URL).toBe("https://api.example.com");
    expect(env.NODE_ID).toBe("worker-01");
  });

  test("listVars returns all vars", () => {
    resolver.setVar("global", null, "KEY1", "val1", false);
    resolver.setVar("automation", "auto-1", "KEY2", "val2", false);

    const vars = resolver.listVars();
    expect(vars.length).toBe(2);
  });

  test("listVars filters by scope", () => {
    resolver.setVar("global", null, "KEY1", "val1", false);
    resolver.setVar("automation", "auto-1", "KEY2", "val2", false);

    const vars = resolver.listVars("global");
    expect(vars.length).toBe(1);
    expect(vars[0].key).toBe("KEY1");
  });

  test("listVars hides secret values", () => {
    resolver.setVar("global", null, "SECRET_KEY", "secret-value", true);

    const vars = resolver.listVars();
    expect(vars[0].isSecret).toBe(true);
    expect(vars[0].value).toBeUndefined();
  });

  test("listVars shows non-secret values", () => {
    resolver.setVar("global", null, "PUBLIC_KEY", "public-value", false);

    const vars = resolver.listVars();
    expect(vars[0].isSecret).toBe(false);
    expect(vars[0].value).toBe("public-value");
  });

  test("deleteVar removes a variable", () => {
    resolver.setVar("global", null, "TO_DELETE", "val", false);
    expect(resolver.deleteVar("global", null, "TO_DELETE")).toBe(true);
    expect(resolver.getVar("global", null, "TO_DELETE")).toBeUndefined();
  });

  test("deleteVar returns false for non-existent variable", () => {
    expect(resolver.deleteVar("global", null, "NONEXISTENT")).toBe(false);
  });

  test("setVar updates existing variable", () => {
    resolver.setVar("global", null, "KEY", "old", false);
    resolver.setVar("global", null, "KEY", "new", false);
    expect(resolver.getVar("global", null, "KEY")).toBe("new");
  });

  test("secret env vars resolve via credential vault", () => {
    const vault = new CredentialVault(db);
    const credId = vault.storeCredential("db-cred", "database", { password: "supersecret" });

    const resolverWithVault = new EnvResolver(db, vault);
    const secretRef = JSON.stringify({ credentialId: credId, key: "password" });
    resolverWithVault.setVar("global", null, "DB_PASSWORD", secretRef, true);

    const val = resolverWithVault.getVar("global", null, "DB_PASSWORD");
    expect(val).toBe("supersecret");
  });

  test("resolveForExecution resolves secret env vars", () => {
    const vault = new CredentialVault(db);
    const credId = vault.storeCredential("api-cred", "api_key", { token: "tok-12345" });

    const resolverWithVault = new EnvResolver(db, vault);
    const secretRef = JSON.stringify({ credentialId: credId, key: "token" });
    resolverWithVault.setVar("global", null, "API_TOKEN", secretRef, true);

    const env = resolverWithVault.resolveForExecution("agent-1", "auto-1");
    expect(env.API_TOKEN).toBe("tok-12345");
  });
});
