import { describe, test, expect, beforeEach } from "bun:test";
import { createDatabase, type AppDatabase } from "../db/database.js";
import { CredentialVault } from "../core/credential-vault.js";
import { registerCredentialRoutes } from "./credentials-routes.js";

describe("Credential routes", () => {
  let db: AppDatabase;
  let vault: CredentialVault;
  let routes: Array<{
    method: string;
    pattern: string;
    handler: (ctx: { db: any; vault: CredentialVault }, req: Request, params: Record<string, string>) => Response | Promise<Response>;
  }>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    vault = new CredentialVault(db);
    routes = [];
    registerCredentialRoutes(routes);
  });

  function findHandler(method: string, pattern: string) {
    return routes.find((r) => r.method === method && r.pattern === pattern)!.handler;
  }

  test("handleCreateCredential - POST /api/credentials", async () => {
    const handler = findHandler("POST", "/api/credentials");
    const req = new Request("http://localhost/api/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "my-api-key", type: "api_key", values: { keyId: "abc", keySecret: "123" } }),
    });
    const res = await handler({ db: db.db, vault }, req, {});
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.id).toBeDefined();
    expect(body.name).toBe("my-api-key");
    expect(body.type).toBe("api_key");
    expect(body.values.keyId).toBe("abc");
  });

  test("handleCreateCredential - 400 when missing fields", async () => {
    const handler = findHandler("POST", "/api/credentials");
    const req = new Request("http://localhost/api/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    const res = await handler({ db: db.db, vault }, req, {});
    expect(res.status).toBe(400);
  });

  test("handleListCredentials - GET /api/credentials", async () => {
    vault.storeCredential("cred1", "api_key", { key: "val1" });
    vault.storeCredential("cred2", "password", { user: "admin" });

    const handler = findHandler("GET", "/api/credentials");
    const req = new Request("http://localhost/api/credentials");
    const res = await handler({ db: db.db, vault }, req, {});
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toHaveLength(2);
    expect(body[0].name).toBeDefined();
    expect(body[0].type).toBeDefined();
  });

  test("handleGetCredential - GET /api/credentials/:id", async () => {
    const id = vault.storeCredential("get-cred", "password", { user: "admin", pass: "secret" });

    const handler = findHandler("GET", "/api/credentials/:id");
    const req = new Request("http://localhost/api/credentials/" + id);
    const res = await handler({ db: db.db, vault }, req, { id });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.id).toBe(id);
    expect(body.values.user).toBe("admin");
    expect(body.values.pass).toBe("secret");
  });

  test("handleGetCredential - 404 for nonexistent", async () => {
    const handler = findHandler("GET", "/api/credentials/:id");
    const req = new Request("http://localhost/api/credentials/nope");
    const res = await handler({ db: db.db, vault }, req, { id: "nope" });
    expect(res.status).toBe(404);
  });

  test("handleUpdateCredential - PUT /api/credentials/:id", async () => {
    const id = vault.storeCredential("updatable", "api_key", { key: "old" });

    const handler = findHandler("PUT", "/api/credentials/:id");
    const req = new Request("http://localhost/api/credentials/" + id, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { key: "new" } }),
    });
    const res = await handler({ db: db.db, vault }, req, { id });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.values.key).toBe("new");
  });

  test("handleUpdateCredential - 404 for nonexistent", async () => {
    const handler = findHandler("PUT", "/api/credentials/:id");
    const req = new Request("http://localhost/api/credentials/nope", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: { key: "val" } }),
    });
    const res = await handler({ db: db.db, vault }, req, { id: "nope" });
    expect(res.status).toBe(404);
  });

  test("handleUpdateCredential - 400 when missing values", async () => {
    const id = vault.storeCredential("up2", "api_key", { key: "val" });
    const handler = findHandler("PUT", "/api/credentials/:id");
    const req = new Request("http://localhost/api/credentials/" + id, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await handler({ db: db.db, vault }, req, { id });
    expect(res.status).toBe(400);
  });

  test("handleDeleteCredential - DELETE /api/credentials/:id", async () => {
    const id = vault.storeCredential("deletable", "api_key", { key: "val" });

    const handler = findHandler("DELETE", "/api/credentials/:id");
    const req = new Request("http://localhost/api/credentials/" + id, { method: "DELETE" });
    const res = await handler({ db: db.db, vault }, req, { id });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  test("handleDeleteCredential - 404 for nonexistent", async () => {
    const handler = findHandler("DELETE", "/api/credentials/:id");
    const req = new Request("http://localhost/api/credentials/nope", { method: "DELETE" });
    const res = await handler({ db: db.db, vault }, req, { id: "nope" });
    expect(res.status).toBe(404);
  });
});
