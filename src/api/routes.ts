import type { Database } from "bun:sqlite";
import type { AgentDispatcher } from "../agent/dispatcher.js";
import type { FleetDispatcher } from "../agent/fleet-dispatcher.js";
import type { WssHub } from "./wss-hub.js";
import type { ArtifactStore } from "./artifacts.js";
import type { RunOptions } from "../core/execution-engine.js";
import type { AutomationDefinition } from "../core/types.js";
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

function matchRoute(pathname: string, pattern: string): Record<string, string> | null {
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
  dispatcher: AgentDispatcher;
  fleetDispatcher?: FleetDispatcher;
  hub?: WssHub;
  artifactStore?: ArtifactStore;
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
      try {
        const body = await req.json() as Partial<RunOptions>;
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
      try {
        const body = await req.json() as { uses?: number; ttlHours?: number };
        return createJoinToken(ctx.db, body);
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }
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
      return new Response(new Uint8Array(result.data), {
        status: 200,
        headers: {
          "Content-Type": result.meta.mime,
          "Content-Disposition": `inline; filename="${result.meta.name}"`,
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
      const ttlHours = url.searchParams.get("ttlHours")
        ? parseInt(url.searchParams.get("ttlHours")!, 10)
        : undefined;
      const meta = ctx.artifactStore.storeArtifact(buffer, contentType, params.id, runId, ttlHours);
      return json(meta, 201);
    },
  },
];

export function handleApiRoute(
  db: Database,
  dispatcher: AgentDispatcher,
  req: Request,
  fleetDispatcher?: FleetDispatcher,
  hub?: WssHub,
  artifactStore?: ArtifactStore,
): Response | Promise<Response> | null {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchRoute(pathname, route.pattern);
    if (params !== null) {
      return route.handler({ db, dispatcher, fleetDispatcher, hub, artifactStore }, req, params);
    }
  }

  return null;
}
