import type { Database } from "bun:sqlite";
import type { EnvResolver } from "../core/env-resolver.js";

export function registerEnvRoutes(
  routes: Array<{
    method: string;
    pattern: string;
    handler: (ctx: { db: Database; envResolver: EnvResolver }, req: Request, params: Record<string, string>) => Response | Promise<Response>;
  }>,
): void {
  routes.push({
    method: "GET",
    pattern: "/api/env",
    handler: (ctx, req) => {
      const url = new URL(req.url);
      const scope = url.searchParams.get("scope") ?? undefined;
      const scopeId = url.searchParams.has("scopeId") ? url.searchParams.get("scopeId") : undefined;
      const vars = ctx.envResolver.listVars(scope, scopeId);
      return new Response(JSON.stringify(vars), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  routes.push({
    method: "POST",
    pattern: "/api/env",
    handler: async (ctx, req) => {
      try {
        const body = await req.json() as {
          scope: "global" | "automation" | "machine";
          scopeId: string | null;
          key: string;
          value: string;
          isSecret: boolean;
        };
        if (!body.scope || !body.key || body.value === undefined) {
          return new Response(JSON.stringify({ error: "scope, key, and value are required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        ctx.envResolver.setVar(body.scope, body.scopeId ?? null, body.key, body.value, body.isSecret ?? false);
        return new Response(JSON.stringify({ success: true }), {
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
    method: "DELETE",
    pattern: "/api/env",
    handler: (ctx, req) => {
      const url = new URL(req.url);
      const scope = url.searchParams.get("scope");
      const scopeId = url.searchParams.get("scopeId");
      const key = url.searchParams.get("key");

      if (!scope || !key) {
        return new Response(JSON.stringify({ error: "scope and key are required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const deleted = ctx.envResolver.deleteVar(scope, scopeId, key);
      if (!deleted) {
        return new Response(JSON.stringify({ error: "Environment variable not found" }), {
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
