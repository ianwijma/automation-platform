import { describe, test, expect, beforeEach } from "bun:test";
import { createDatabase, type AppDatabase } from "../db/database.js";
import { CredentialVault } from "../core/credential-vault.js";
import { EnvResolver } from "../core/env-resolver.js";
import { registerEnvRoutes } from "./env-routes.js";

describe("Environment variable routes", () => {
  let db: AppDatabase;
  let vault: CredentialVault;
  let envResolver: EnvResolver;
  let routes: Array<{
    method: string;
    pattern: string;
    handler: (ctx: { db: any; envResolver: EnvResolver }, req: Request, params: Record<string, string>) => Response | Promise<Response>;
  }>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    vault = new CredentialVault(db);
    envResolver = new EnvResolver(db, vault);
    routes = [];
    registerEnvRoutes(routes);
  });

  function findHandler(method: string, pattern: string) {
    return routes.find((r) => r.method === method && r.pattern === pattern)!.handler;
  }

  test("handleListEnvVars - GET /api/env returns empty list", async () => {
    const handler = findHandler("GET", "/api/env");
    const req = new Request("http://localhost/api/env");
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toEqual([]);
  });

  test("handleListEnvVars - GET /api/env with scope filter", async () => {
    envResolver.setVar("global", null, "API_KEY", "abc123", false);
    envResolver.setVar("automation", "auto-1", "DB_URL", "postgres://...", false);

    const handler = findHandler("GET", "/api/env");
    const req = new Request("http://localhost/api/env?scope=global");
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toHaveLength(1);
    expect(body[0].key).toBe("API_KEY");
    expect(body[0].scope).toBe("global");
  });

  test("handleListEnvVars - GET /api/env with scope and scopeId", async () => {
    envResolver.setVar("automation", "auto-1", "KEY1", "val1", false);
    envResolver.setVar("automation", "auto-2", "KEY2", "val2", false);

    const handler = findHandler("GET", "/api/env");
    const req = new Request("http://localhost/api/env?scope=automation&scopeId=auto-1");
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toHaveLength(1);
    expect(body[0].key).toBe("KEY1");
  });

  test("handleSetEnvVar - POST /api/env", async () => {
    const handler = findHandler("POST", "/api/env");
    const req = new Request("http://localhost/api/env", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "global", scopeId: null, key: "MY_VAR", value: "hello", isSecret: false }),
    });
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);

    const val = envResolver.getVar("global", null, "MY_VAR");
    expect(val).toBe("hello");
  });

  test("handleSetEnvVar - POST /api/env with secret", async () => {
    const handler = findHandler("POST", "/api/env");
    const req = new Request("http://localhost/api/env", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "global", scopeId: null, key: "SECRET_VAR", value: "s3cret", isSecret: true }),
    });
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(201);

    const listed = envResolver.listVars("global");
    const found = listed.find((v) => v.key === "SECRET_VAR");
    expect(found).toBeDefined();
    expect(found!.isSecret).toBe(true);
    expect(found!.value).toBeUndefined();
  });

  test("handleSetEnvVar - 400 when missing required fields", async () => {
    const handler = findHandler("POST", "/api/env");
    const req = new Request("http://localhost/api/env", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "NO_SCOPE" }),
    });
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(400);
  });

  test("handleDeleteEnvVar - DELETE /api/env", async () => {
    envResolver.setVar("global", null, "DEL_ME", "bye", false);

    const handler = findHandler("DELETE", "/api/env");
    const req = new Request("http://localhost/api/env?scope=global&key=DEL_ME", {
      method: "DELETE",
    });
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);

    expect(envResolver.getVar("global", null, "DEL_ME")).toBeUndefined();
  });

  test("handleDeleteEnvVar - 404 when var not found", async () => {
    const handler = findHandler("DELETE", "/api/env");
    const req = new Request("http://localhost/api/env?scope=global&key=NOPE", {
      method: "DELETE",
    });
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(404);
  });

  test("handleDeleteEnvVar - 400 when missing scope or key", async () => {
    const handler = findHandler("DELETE", "/api/env");
    const req = new Request("http://localhost/api/env?key=NO_SCOPE", {
      method: "DELETE",
    });
    const res = await handler({ db: db.db, envResolver }, req, {});
    expect(res.status).toBe(400);
  });
});
