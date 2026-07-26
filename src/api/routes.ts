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
  createAutomation,
  getAutomation,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  activateAutomation,
  deactivateAutomation,
} from "./automations.js";
import { runAutomation, getRun, listRuns } from "./runs.js";
import { listAgents, createJoinToken, triggerAgentUpdate, updateAgentTags } from "./agent-routes.js";
import { listVersions, revertToVersion, labelVersion } from "./versions.js";
import { handleAiChat, handleAiApply, handleAiModels } from "./ai-routes.js";
import { handleGetSettings, handleUpdateSettings } from "./settings-routes.js";
import { exportAutomation, importAutomation } from "./export-import.js";
import { handleWebhookRequest } from "./webhooks.js";
import { runNode } from "./run-node.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Agent-Token",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

export function matchRoute(pathname: string, pattern: string): Record<string, string> | null {
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
    pattern: "/api/automations",
    handler: async (ctx, req) => {
      try {
        const body = await req.json() as { name: string; definition: AutomationDefinition };
        if (!body.name || !body.definition) {
          return json({ error: "name and definition are required" }, 400);
        }
        const automation = createAutomation(ctx.db, body.name, body.definition);
        return json(automation, 201);
      } catch {
        return json({ error: "Invalid request body" }, 400);
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
        const body = await req.json() as { definition: AutomationDefinition };
        if (!body.definition) {
          return json({ error: "definition is required" }, 400);
        }
        const automation = updateAutomation(ctx.db, params.id, body.definition);
        if (!automation) return json({ error: "Automation not found" }, 404);
        return json(automation);
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }
    },
  },
  {
    method: "DELETE",
    pattern: "/api/automations/:id",
    handler: (ctx, _req, params) => {
      const deleted = deleteAutomation(ctx.db, params.id);
      if (!deleted) return json({ error: "Automation not found" }, 404);
      return json({ success: true });
    },
  },
  {
    method: "POST",
    pattern: "/api/automations/:id/activate",
    handler: (ctx, _req, params) => {
      const automation = activateAutomation(ctx.db, params.id);
      if (!automation) return json({ error: "Automation not found" }, 404);
      return json(automation);
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
        body = await req.json() as Partial<RunOptions>;
      } catch {
        // empty body is ok — all fields have defaults
      }
      try {
        const options: RunOptions = {
          mode: body.mode ?? "manual",
          dryRun: body.dryRun,
          fromNodeId: body.fromNodeId,
          pinData: body.pinData,
        };
        const run = await runAutomation(ctx.db, ctx.dispatcher, params.id, options);
        if (!run) return json({ error: "Automation not found or no version available" }, 404);
        return json(run, 201);
      } catch {
        return json({ error: "Invalid request body" }, 400);
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
        const run = await rerunFromNode(ctx.db, ctx.dispatcher, params.id, params.nodeId);
        if (!run) return json({ error: "Run or node not found" }, 404);
        return json(run, 201);
      } catch {
        return json({ error: "Rerun failed" }, 500);
      }
    },
  },
  {
    method: "POST",
    pattern: "/api/runs/:id/cancel",
    handler: (ctx, _req, params) => {
      return json({ error: "Not yet implemented" }, 501);
    },
  },
  {
    method: "POST",
    pattern: "/api/automations/:id/run-node/:nodeId",
    handler: async (ctx, req, params) => {
      try {
        let fresh = false;
        let inputData;
        try {
          const body = await req.json();
          fresh = body?.fresh === true;
          inputData = body?.inputData;
        } catch {}
        const run = await runNode(ctx.db, ctx.dispatcher, params.id, params.nodeId, { fresh, inputData });
        if (!run) return json({ error: "Automation or node not found" }, 404);
        return json(run, 201);
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
        body = await req.json() as { uses?: number; ttlHours?: number };
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
        const body = await req.json() as { tags: string[] };
        if (!Array.isArray(body.tags)) {
          return json({ error: "tags must be an array" }, 400);
        }
        return updateAgentTags(ctx.db, ctx.hub, params.id, body.tags);
      } catch {
        return json({ error: "Invalid request body" }, 400);
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
      const safeName = result.meta.name.replace(/["\\]/g, "_");
      return new Response(new Uint8Array(result.data), {
        status: 200,
        headers: {
          "Content-Type": result.meta.mime,
          "Content-Disposition": `inline; filename="${safeName}"`,
          "X-Artifact-Id": result.meta.id,
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
      const authHeader = req.headers.get("Authorization");
      const agentToken = req.headers.get("X-Agent-Token");
      if (!authHeader && !agentToken) {
        return json({ error: "Authentication required" }, 401);
      }
      const contentType = req.headers.get("Content-Type") ?? "application/octet-stream";
      const buffer = Buffer.from(await req.arrayBuffer());
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId") ?? "unknown";
      let ttlHours: number | undefined;
      const ttlParam = url.searchParams.get("ttlHours");
      if (ttlParam) {
        const parsed = parseInt(ttlParam, 10);
        ttlHours = isNaN(parsed) ? undefined : parsed;
      }
      const meta = ctx.artifactStore.storeArtifact(buffer, contentType, params.id, runId, ttlHours);
      return json(meta, 201);
    },
  },
  {
    method: "POST",
    pattern: "/api/credentials",
    handler: async (ctx, req) => {
      if (!ctx.vault) return json({ error: "Credential vault not available" }, 400);
      try {
        const body = await req.json() as { name: string; type: string; values: Record<string, string> };
        if (!body.name || !body.type || !body.values) {
          return json({ error: "name, type, and values are required" }, 400);
        }
        const id = ctx.vault.storeCredential(body.name, body.type, body.values);
        const cred = ctx.vault.getCredential(id);
        return json({ id, ...cred }, 201);
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }
    },
  },
  {
    method: "GET",
    pattern: "/api/credentials",
    handler: (ctx) => {
      if (!ctx.vault) return json({ error: "Credential vault not available" }, 400);
      const credentials = ctx.vault.listCredentials();
      return json(credentials);
    },
  },
  {
    method: "GET",
    pattern: "/api/credentials/:id",
    handler: (ctx, _req, params) => {
      if (!ctx.vault) return json({ error: "Credential vault not available" }, 400);
      try {
        const cred = ctx.vault.getCredential(params.id);
        return json({ id: params.id, ...cred });
      } catch {
        return json({ error: "Credential not found" }, 404);
      }
    },
  },
  {
    method: "PUT",
    pattern: "/api/credentials/:id",
    handler: async (ctx, req, params) => {
      if (!ctx.vault) return json({ error: "Credential vault not available" }, 400);
      try {
        const body = await req.json() as { values: Record<string, string> };
        if (!body.values) return json({ error: "values are required" }, 400);
        try {
          ctx.vault.getCredential(params.id);
        } catch {
          return json({ error: "Credential not found" }, 404);
        }
        ctx.vault.updateCredential(params.id, body.values);
        const cred = ctx.vault.getCredential(params.id);
        return json({ id: params.id, ...cred });
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }
    },
  },
  {
    method: "DELETE",
    pattern: "/api/credentials/:id",
    handler: (ctx, _req, params) => {
      if (!ctx.vault) return json({ error: "Credential vault not available" }, 400);
      const deleted = ctx.vault.deleteCredential(params.id);
      if (!deleted) return json({ error: "Credential not found" }, 404);
      return json({ success: true });
    },
  },
  {
    method: "GET",
    pattern: "/api/env",
    handler: (ctx, req) => {
      if (!ctx.envResolver) return json({ error: "Env resolver not available" }, 400);
      const url = new URL(req.url);
      const scope = url.searchParams.get("scope") ?? undefined;
      const scopeId = url.searchParams.has("scopeId") ? url.searchParams.get("scopeId") : undefined;
      const vars = ctx.envResolver.listVars(scope, scopeId);
      return json(vars);
    },
  },
  {
    method: "POST",
    pattern: "/api/env",
    handler: async (ctx, req) => {
      if (!ctx.envResolver) return json({ error: "Env resolver not available" }, 400);
      try {
        const body = await req.json() as {
          scope: "global" | "automation" | "machine";
          scopeId: string | null;
          key: string;
          value: string;
          isSecret: boolean;
        };
        if (!body.scope || !body.key || body.value === undefined) {
          return json({ error: "scope, key, and value are required" }, 400);
        }
        ctx.envResolver.setVar(body.scope, body.scopeId ?? null, body.key, body.value, body.isSecret ?? false);
        return json({ success: true }, 201);
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }
    },
  },
  {
    method: "DELETE",
    pattern: "/api/env",
    handler: (ctx, req) => {
      if (!ctx.envResolver) return json({ error: "Env resolver not available" }, 400);
      const url = new URL(req.url);
      const scope = url.searchParams.get("scope");
      const scopeId = url.searchParams.get("scopeId");
      const key = url.searchParams.get("key");
      if (!scope || !key) return json({ error: "scope and key are required" }, 400);
      const deleted = ctx.envResolver.deleteVar(scope, scopeId, key);
      if (!deleted) return json({ error: "Environment variable not found" }, 404);
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
        return json({ error: "Vault and env resolver required for import" }, 400);
      }
      try {
        const body = await req.json() as ImportRequest;
        if (!body.automation) return json({ error: "automation is required" }, 400);
        const id = importAutomation(ctx.appDb, ctx.vault, ctx.envResolver, body);
        return json({ id }, 201);
      } catch {
        return json({ error: "Invalid request body" }, 400);
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
      if (isNaN(versionNo)) return json({ error: "Invalid version number" }, 400);
      const result = revertToVersion(ctx.db, params.id, versionNo);
      if (!result) return json({ error: "Version or automation not found" }, 404);
      return json(result);
    },
  },
  {
    method: "PUT",
    pattern: "/api/automations/:id/versions/:versionId/label",
    handler: async (ctx, req, params) => {
      try {
        const body = await req.json() as { label: string };
        if (!body.label) return json({ error: "label is required" }, 400);
        const success = labelVersion(ctx.db, params.versionId, body.label);
        if (!success) return json({ error: "Version not found" }, 404);
        return json({ success: true });
      } catch {
        return json({ error: "Invalid request body" }, 400);
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
      return handleWebhookRequest(ctx.db, ctx.dispatcher, params.autoId, params.path, req, "test");
    },
  },
  {
    method: "POST",
    pattern: "/hooks/:autoId/:path",
    handler: async (ctx, req, params) => {
      return handleWebhookRequest(ctx.db, ctx.dispatcher, params.autoId, params.path, req, "prod");
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
        { db, appDb: appDb ?? (db as any), dispatcher, fleetDispatcher, hub, artifactStore, vault, envResolver },
        req,
        params,
      );
    }
  }

  return null;
}
