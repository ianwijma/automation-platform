import { randomUUID } from "node:crypto";
import { nodeCatalog, runOptionsSchema, itemSchema } from "../core/schemas.js";
import { registerWebhook } from "./webhooks.js";
import type { Database } from "bun:sqlite";
import type { AgentDispatcher } from "../agent/dispatcher.js";
import type { FleetDispatcher } from "../agent/fleet-dispatcher.js";
import type { WssHub } from "./wss-hub.js";
import type { ArtifactStore } from "./artifacts.js";
import type { RunOptions } from "../core/execution-engine.js";
import type { AutomationDefinition } from "../core/types.js";
import type { CredentialVault } from "../core/credential-vault.js";
import type { EnvResolver } from "../core/env-resolver.js";
import type { AppDatabase } from "../db/database.js";
import type { ImportRequest } from "../core/api-types.js";
import {
  definitionRevision,
  createAutomation,
  getAutomation,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  activateAutomation,
  deactivateAutomation,
} from "./automations.js";
import { runAutomation, getRun, listRuns } from "./runs.js";
import {
  listAgents,
  createJoinToken,
  triggerAgentUpdate,
  updateAgentTags,
} from "./agent-routes.js";
import { listVersions, revertToVersion, labelVersion } from "./versions.js";
import { handleAiChat, handleAiApply, handleAiModels } from "./ai-routes.js";
import { handleGetSettings, handleUpdateSettings } from "./settings-routes.js";
import { exportAutomation, importAutomation } from "./export-import.js";
import { handleWebhookRequest } from "./webhooks.js";
import { runNode } from "./run-node.js";

const CORS_HEADERS: Record<string, string> = {};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

export function matchRoute(
  pathname: string,
  pattern: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return params;
}

interface RouteContext {
  db: Database;
  appDb: AppDatabase;
  dispatcher: AgentDispatcher;
  fleetDispatcher?: FleetDispatcher;
  hub?: WssHub;
  artifactStore?: ArtifactStore;
  vault?: CredentialVault;
  envResolver?: EnvResolver;
}

type RouteHandler = (
  ctx: RouteContext,
  req: Request,
  params: Record<string, string>,
) => Response | Promise<Response>;

interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

const routes: Route[] = [
  {
    method: "POST",
    pattern: "/api/session",
    handler: (_ctx, req) => {
      const token =
        req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      if (!process.env.AP_ADMIN_TOKEN || token !== process.env.AP_ADMIN_TOKEN)
        return json({ error: "Invalid token" }, 401);
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `ap_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.AP_PUBLIC_URL?.startsWith("https://") ? "; Secure" : ""}`,
        },
      });
    },
  },
  {
    method: "DELETE",
    pattern: "/api/agents/:id",
    handler: (ctx, _req, params) => {
      if (params.id === "local")
        return json({ error: "Cannot revoke local agent" }, 400);
      ctx.hub?.revokeAgent(params.id);
      return json({ success: true });
    },
  },
  { method: "GET", pattern: "/api/nodes", handler: () => json(nodeCatalog()) },
  {
    method: "POST",
    pattern: "/api/automations/:id/webhook-test",
    handler: async (ctx, req, params) => {
      const body = await req.json();
      const auto = getAutomation(ctx.db, params.id);
      const trigger = auto?.draft?.nodes.find(
        (n) =>
          !n.disabled &&
          n.type === "trigger.webhook" &&
          (body.nodeId ? n.id === body.nodeId : n.params.path === body.path),
      );
      if (!trigger) return json({ error: "Webhook not found" }, 404);
      const path = String(trigger.params.path);
      registerWebhook(params.id, path);
      return json({
        expiresInSec: 120,
        url: `/hooks/test/${params.id}/${encodeURIComponent(path)}`,
      });
    },
  },
  {
    method: "POST",
    pattern: "/api/automations",
    handler: async (ctx, req) => {
      try {
        const body = (await req.json()) as {
          name: string;
          definition: AutomationDefinition;
        };
        if (!body.name || !body.definition) {
          return json({ error: "name and definition are required" }, 400);
        }
        const automation = createAutomation(ctx.db, body.name, body.definition);
        return json(automation, 201);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "GET",
    pattern: "/api/automations",
    handler: (ctx) => {
      const automations = listAutomations(ctx.db);
      return json(automations);
    },
  },
  {
    method: "GET",
    pattern: "/api/automations/:id",
    handler: (ctx, _req, params) => {
      const automation = getAutomation(ctx.db, params.id);
      if (!automation) return json({ error: "Automation not found" }, 404);
      return json(automation);
    },
  },
  {
    method: "PUT",
    pattern: "/api/automations/:id",
    handler: async (ctx, req, params) => {
      try {
        const body = (await req.json()) as {
          definition: AutomationDefinition;
          baseRevision?: string;
        };
        if (!body.definition) {
          return json({ error: "definition is required" }, 400);
        }
        const current = getAutomation(ctx.db, params.id);
        if (
          current &&
          body.baseRevision &&
          body.baseRevision !== definitionRevision(current.draft)
        )
          return json(
            { error: "Draft changed in another editor. Reload before saving." },
            409,
          );
        const automation = updateAutomation(ctx.db, params.id, body.definition);
        if (!automation) return json({ error: "Automation not found" }, 404);
        return json(automation);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "DELETE",
    pattern: "/api/automations/:id",
    handler: (ctx, _req, params) => {
      if (
        ctx.dispatcher
          .getAllRuns()
          .some(
            (run) =>
              run.automationId === params.id &&
              ["running", "queued"].includes(run.status),
          )
      )
        return json(
          { error: "Cancel active runs before deleting this automation" },
          409,
        );
      const deleted = deleteAutomation(ctx.db, params.id);
      if (!deleted) return json({ error: "Automation not found" }, 404);
      return json({ success: true });
    },
  },
  {
    method: "POST",
    pattern: "/api/automations/:id/activate",
    handler: (ctx, _req, params) => {
      try {
        const automation = activateAutomation(ctx.db, params.id);
        if (!automation) return json({ error: "Automation not found" }, 404);
        return json(automation);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : String(error) },
          400,
        );
      }
    },
  },
  {
    method: "POST",
    pattern: "/api/automations/:id/deactivate",
    handler: (ctx, _req, params) => {
      const automation = deactivateAutomation(ctx.db, params.id);
      if (!automation) return json({ error: "Automation not found" }, 404);
      return json(automation);
    },
  },
  {
    method: "POST",
    pattern: "/api/automations/:id/run",
    handler: async (ctx, req, params) => {
      let body: Partial<RunOptions> = {};
      try {
        body = (await req.json()) as Partial<RunOptions>;
      } catch {
        // empty body is ok — all fields have defaults
      }
      try {
        const options = runOptionsSchema.parse(body);
        const id = randomUUID();
        const work = runAutomation(ctx.db, ctx.dispatcher, params.id, {
          ...options,
          runId: id,
        });
        const initial = ctx.dispatcher.getRun(id);
        if (!initial) {
          await work;
          return json({ error: "Automation not found" }, 404);
        }
        void work.catch((error) => console.error("Run failed", error));
        return json(initial, 202);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "GET",
    pattern: "/api/runs",
    handler: (ctx, req) => {
      const url = new URL(req.url);
      const automationId = url.searchParams.get("automationId") ?? undefined;
      const runs = listRuns(ctx.dispatcher, automationId);
      return json(runs);
    },
  },
  {
    method: "GET",
    pattern: "/api/runs/:id",
    handler: (ctx, _req, params) => {
      const run = getRun(ctx.dispatcher, params.id);
      if (!run) return json({ error: "Run not found" }, 404);
      return json(run);
    },
  },
  {
    method: "POST",
    pattern: "/api/runs/:id/rerun-from/:nodeId",
    handler: async (ctx, _req, params) => {
      try {
        const { rerunFromNode } = await import("./rerun.js");
        const id = randomUUID();
        const work = rerunFromNode(
          ctx.db,
          ctx.dispatcher,
          params.id,
          params.nodeId,
          id,
        );
        const run = ctx.dispatcher.getRun(id);
        if (!run) {
          await work;
          return json({ error: "Run or node not found" }, 404);
        }
        void work.catch((error) => console.error("Rerun failed", error));
        return json(run, 202);
      } catch {
        return json({ error: "Rerun failed" }, 500);
      }
    },
  },
  {
    method: "POST",
    pattern: "/api/runs/:id/cancel",
    handler: (ctx, _req, params) => {
      if (!ctx.dispatcher.getRun(params.id))
        return json({ error: "Run not found" }, 404);
      return ctx.dispatcher.cancelRun(params.id)
        ? json({ success: true }, 202)
        : json({ error: "Run already finished" }, 409);
    },
  },
  {
    method: "POST",
    pattern: "/api/automations/:id/run-node/:nodeId",
    handler: async (ctx, req, params) => {
      try {
        let fresh = false;
        let dryRun = false;
        let inputData;
        try {
          const body = await req.json();
          fresh = body?.fresh === true;
          dryRun = body?.dryRun === true;
          inputData = body?.inputData;
        } catch {}
        if (inputData !== undefined)
          inputData = itemSchema.array().parse(inputData);
        const id = randomUUID();
        const work = runNode(ctx.db, ctx.dispatcher, params.id, params.nodeId, {
          fresh,
          inputData,
          dryRun,
          runId: id,
        });
        const run = ctx.dispatcher.getRun(id);
        if (!run) {
          await work;
          return json({ error: "Automation or node not found" }, 404);
        }
        void work.catch((error) => console.error("Node run failed", error));
        return json(run, 202);
      } catch {
        return json({ error: "Node execution failed" }, 500);
      }
    },
  },
  {
    method: "GET",
    pattern: "/api/agents",
    handler: (ctx) => {
      if (!ctx.hub) {
        return json({ error: "Fleet mode not enabled" }, 400);
      }
      return listAgents(ctx.db, ctx.hub);
    },
  },
  {
    method: "POST",
    pattern: "/api/agents/join-tokens",
    handler: async (ctx, req) => {
      let body: { uses?: number; ttlHours?: number } = {};
      try {
        body = (await req.json()) as { uses?: number; ttlHours?: number };
      } catch {
        // empty body is ok — all fields have defaults
      }
      return createJoinToken(ctx.db, body);
    },
  },
  {
    method: "POST",
    pattern: "/api/agents/:id/update",
    handler: (ctx, _req, params) => {
      if (!ctx.hub) {
        return json({ error: "Fleet mode not enabled" }, 400);
      }
      return triggerAgentUpdate(ctx.hub, params.id);
    },
  },
  {
    method: "PUT",
    pattern: "/api/agents/:id/tags",
    handler: async (ctx, req, params) => {
      if (!ctx.hub) {
        return json({ error: "Fleet mode not enabled" }, 400);
      }
      try {
        const body = (await req.json()) as { tags: string[] };
        if (!Array.isArray(body.tags)) {
          return json({ error: "tags must be an array" }, 400);
        }
        return updateAgentTags(ctx.db, ctx.hub, params.id, body.tags);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "GET",
    pattern: "/api/artifacts/:id",
    handler: (ctx, _req, params) => {
      if (!ctx.artifactStore) {
        return json({ error: "Artifact storage not available" }, 400);
      }
      const result = ctx.artifactStore.getArtifact(params.id);
      if (!result) return json({ error: "Artifact not found" }, 404);
      const safeName = result.meta.name.replace(/["\\\r\n]/g, "_");
      return new Response(new Uint8Array(result.data), {
        status: 200,
        headers: {
          "Content-Type": result.meta.mime,
          "Content-Disposition": `inline; filename="${safeName}"`,
          "X-Artifact-Id": result.meta.id,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "sandbox; default-src 'none'; img-src data:",
          ...CORS_HEADERS,
        },
      });
    },
  },
  {
    method: "PUT",
    pattern: "/api/artifacts/:id",
    handler: async (ctx, req, params) => {
      if (!ctx.artifactStore) {
        return json({ error: "Artifact storage not available" }, 400);
      }
      // Authentication is enforced centrally before routing.
      const contentType =
        req.headers.get("Content-Type") ?? "application/octet-stream";
      const buffer = Buffer.from(await req.arrayBuffer());
      if (buffer.byteLength > 32 * 1024 * 1024)
        return json({ error: "Artifact too large" }, 413);
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId");
      if (!runId || !ctx.dispatcher.getRun(runId))
        return json({ error: "Valid runId required" }, 400);
      let ttlHours: number | undefined;
      const ttlParam = url.searchParams.get("ttlHours");
      if (ttlParam) {
        const parsed = parseInt(ttlParam, 10);
        if (
          !Number.isFinite(Number(ttlParam)) ||
          Number(ttlParam) <= 0 ||
          Number(ttlParam) > 8760
        )
          return json({ error: "Invalid artifact retention" }, 400);
        ttlHours = Number(ttlParam);
      }
      const meta = ctx.artifactStore.storeArtifact(
        buffer,
        contentType,
        params.id,
        runId,
        ttlHours,
      );
      return json(meta, 201);
    },
  },
  {
    method: "POST",
    pattern: "/api/credentials",
    handler: async (ctx, req) => {
      if (!ctx.vault)
        return json({ error: "Credential vault not available" }, 400);
      try {
        const body = (await req.json()) as {
          name: string;
          type: string;
          values: Record<string, string>;
        };
        if (!body.name || !body.type || !body.values) {
          return json({ error: "name, type, and values are required" }, 400);
        }
        const id = ctx.vault.storeCredential(body.name, body.type, body.values);
        const cred = ctx.vault.getMetadata(id);
        return json(cred, 201);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "GET",
    pattern: "/api/credentials",
    handler: (ctx) => {
      if (!ctx.vault)
        return json({ error: "Credential vault not available" }, 400);
      const credentials = ctx.vault.listCredentials();
      return json(credentials);
    },
  },
  {
    method: "GET",
    pattern: "/api/credentials/:id",
    handler: (ctx, _req, params) => {
      if (!ctx.vault)
        return json({ error: "Credential vault not available" }, 400);
      try {
        const cred = ctx.vault.getMetadata(params.id);
        return json(cred);
      } catch {
        return json({ error: "Credential not found" }, 404);
      }
    },
  },
  {
    method: "PUT",
    pattern: "/api/credentials/:id",
    handler: async (ctx, req, params) => {
      if (!ctx.vault)
        return json({ error: "Credential vault not available" }, 400);
      try {
        const body = (await req.json()) as { values: Record<string, string> };
        if (!body.values) return json({ error: "values are required" }, 400);
        try {
          ctx.vault.getMetadata(params.id);
        } catch {
          return json({ error: "Credential not found" }, 404);
        }
        ctx.vault.updateCredential(params.id, body.values);
        const cred = ctx.vault.getMetadata(params.id);
        return json(cred);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "DELETE",
    pattern: "/api/credentials/:id",
    handler: (ctx, _req, params) => {
      if (!ctx.vault)
        return json({ error: "Credential vault not available" }, 400);
      const deleted = ctx.vault.deleteCredential(params.id);
      if (!deleted) return json({ error: "Credential not found" }, 404);
      return json({ success: true });
    },
  },
  {
    method: "GET",
    pattern: "/api/env",
    handler: (ctx, req) => {
      if (!ctx.envResolver)
        return json({ error: "Env resolver not available" }, 400);
      const url = new URL(req.url);
      const scope = url.searchParams.get("scope") ?? undefined;
      const scopeId = url.searchParams.has("scopeId")
        ? url.searchParams.get("scopeId")
        : undefined;
      const vars = ctx.envResolver.listVars(scope, scopeId);
      return json(vars);
    },
  },
  {
    method: "POST",
    pattern: "/api/env",
    handler: async (ctx, req) => {
      if (!ctx.envResolver)
        return json({ error: "Env resolver not available" }, 400);
      try {
        const body = (await req.json()) as {
          scope: "global" | "automation" | "machine";
          scopeId: string | null;
          key: string;
          value: string;
          isSecret: boolean;
        };
        if (!body.scope || !body.key || body.value === undefined) {
          return json({ error: "scope, key, and value are required" }, 400);
        }
        ctx.envResolver.setVar(
          body.scope,
          body.scopeId ?? null,
          body.key,
          body.value,
          body.isSecret ?? false,
        );
        return json({ success: true }, 201);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "DELETE",
    pattern: "/api/env",
    handler: (ctx, req) => {
      if (!ctx.envResolver)
        return json({ error: "Env resolver not available" }, 400);
      const url = new URL(req.url);
      const scope = url.searchParams.get("scope");
      const scopeId = url.searchParams.get("scopeId");
      const key = url.searchParams.get("key");
      if (!scope || !key)
        return json({ error: "scope and key are required" }, 400);
      const deleted = ctx.envResolver.deleteVar(scope, scopeId, key);
      if (!deleted)
        return json({ error: "Environment variable not found" }, 404);
      return json({ success: true });
    },
  },
  {
    method: "GET",
    pattern: "/api/automations/:id/export",
    handler: (ctx, _req, params) => {
      const result = exportAutomation(ctx.db, params.id);
      if (!result) return json({ error: "Automation not found" }, 404);
      return json(result);
    },
  },
  {
    method: "POST",
    pattern: "/api/import",
    handler: async (ctx, req) => {
      if (!ctx.vault || !ctx.envResolver) {
        return json(
          { error: "Vault and env resolver required for import" },
          400,
        );
      }
      try {
        const body = (await req.json()) as ImportRequest;
        if (!body.automation)
          return json({ error: "automation is required" }, 400);
        const id = importAutomation(
          ctx.appDb,
          ctx.vault,
          ctx.envResolver,
          body,
        );
        return json({ id }, 201);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "GET",
    pattern: "/api/automations/:id/versions",
    handler: (ctx, _req, params) => {
      const automation = getAutomation(ctx.db, params.id);
      if (!automation) return json({ error: "Automation not found" }, 404);
      const versions = listVersions(ctx.db, params.id);
      return json(versions);
    },
  },
  {
    method: "POST",
    pattern: "/api/automations/:id/revert/:versionNo",
    handler: (ctx, _req, params) => {
      const versionNo = parseInt(params.versionNo, 10);
      if (isNaN(versionNo))
        return json({ error: "Invalid version number" }, 400);
      const result = revertToVersion(ctx.db, params.id, versionNo);
      if (!result)
        return json({ error: "Version or automation not found" }, 404);
      return json(result);
    },
  },
  {
    method: "PUT",
    pattern: "/api/automations/:id/versions/:versionId/label",
    handler: async (ctx, req, params) => {
      try {
        const body = (await req.json()) as { label: string };
        if (!body.label) return json({ error: "label is required" }, 400);
        const success = labelVersion(ctx.db, params.versionId, body.label);
        if (!success) return json({ error: "Version not found" }, 404);
        return json({ success: true });
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Invalid request body",
          },
          400,
        );
      }
    },
  },
  {
    method: "POST",
    pattern: "/api/ai/chat",
    handler: (ctx, req) => handleAiChat(ctx.db, req),
  },
  {
    method: "POST",
    pattern: "/api/ai/apply",
    handler: (ctx, req) => handleAiApply(ctx.db, req),
  },
  {
    method: "GET",
    pattern: "/api/ai/models",
    handler: (ctx, req) => handleAiModels(ctx.db, req),
  },
  {
    method: "POST",
    pattern: "/hooks/test/:autoId/:path",
    handler: async (ctx, req, params) => {
      return handleWebhookRequest(
        ctx.db,
        ctx.dispatcher,
        params.autoId,
        params.path,
        req,
        "test",
      );
    },
  },
  {
    method: "POST",
    pattern: "/hooks/:autoId/:path",
    handler: async (ctx, req, params) => {
      return handleWebhookRequest(
        ctx.db,
        ctx.dispatcher,
        params.autoId,
        params.path,
        req,
        "prod",
      );
    },
  },
  {
    method: "GET",
    pattern: "/api/settings",
    handler: (ctx) => handleGetSettings(ctx.db),
  },
  {
    method: "PUT",
    pattern: "/api/settings",
    handler: (ctx, req) => handleUpdateSettings(ctx.db, req),
  },
];

export function handleApiRoute(
  db: Database,
  dispatcher: AgentDispatcher,
  req: Request,
  fleetDispatcher?: FleetDispatcher,
  hub?: WssHub,
  artifactStore?: ArtifactStore,
  appDb?: AppDatabase,
  vault?: CredentialVault,
  envResolver?: EnvResolver,
): Response | Promise<Response> | null {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchRoute(pathname, route.pattern);
    if (params !== null) {
      return route.handler(
        {
          db,
          appDb: appDb ?? (db as any),
          dispatcher,
          fleetDispatcher,
          hub,
          artifactStore,
          vault,
          envResolver,
        },
        req,
        params,
      );
    }
  }

  return null;
}
