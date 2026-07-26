import type { Database } from "bun:sqlite";
import type { CredentialVault } from "../core/credential-vault.js";

export function registerCredentialRoutes(
  routes: Array<{
    method: string;
    pattern: string;
    handler: (ctx: { db: Database; vault: CredentialVault }, req: Request, params: Record<string, string>) => Response | Promise<Response>;
  }>,
): void {
  routes.push({
    method: "POST",
    pattern: "/api/credentials",
    handler: async (ctx, req) => {
      try {
        const body = await req.json() as { name: string; type: string; values: Record<string, string> };
        if (!body.name || !body.type || !body.values) {
          return new Response(JSON.stringify({ error: "name, type, and values are required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const id = ctx.vault.storeCredential(body.name, body.type, body.values);
        const cred = ctx.vault.getCredential(id);
        return new Response(JSON.stringify({ id, ...cred }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/credentials",
    handler: (ctx) => {
      const credentials = ctx.vault.listCredentials();
      return new Response(JSON.stringify(credentials), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  routes.push({
    method: "GET",
    pattern: "/api/credentials/:id",
    handler: (ctx, _req, params) => {
      try {
        const cred = ctx.vault.getCredential(params.id);
        return new Response(JSON.stringify({ id: params.id, ...cred }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Credential not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  });

  routes.push({
    method: "PUT",
    pattern: "/api/credentials/:id",
    handler: async (ctx, req, params) => {
      try {
        const body = await req.json() as { values: Record<string, string> };
        if (!body.values) {
          return new Response(JSON.stringify({ error: "values are required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          ctx.vault.getCredential(params.id);
        } catch {
          return new Response(JSON.stringify({ error: "Credential not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        ctx.vault.updateCredential(params.id, body.values);
        const cred = ctx.vault.getCredential(params.id);
        return new Response(JSON.stringify({ id: params.id, ...cred }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  });

  routes.push({
    method: "DELETE",
    pattern: "/api/credentials/:id",
    handler: (ctx, _req, params) => {
      const deleted = ctx.vault.deleteCredential(params.id);
      if (!deleted) {
        return new Response(JSON.stringify({ error: "Credential not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}
