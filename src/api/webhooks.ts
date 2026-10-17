import { randomUUID } from "node:crypto";
import type { AutomationDefinition } from "../core/types.js";
import type { Database } from "bun:sqlite";
import type { AgentDispatcher } from "../agent/dispatcher.js";
import type { RunOptions } from "../core/execution-engine.js";
import type { NodeItem } from "../core/node-contract.js";
import { getAutomation } from "./automations.js";
import { runAutomation } from "./runs.js";

interface TestWebhookEntry {
  automationId: string;
  path: string;
  registeredAt: number;
  expiresAt: number;
}

const testWebhooks = new Map<string, TestWebhookEntry>();

const TEST_WEBHOOK_TTL_MS = 2 * 60 * 1000;

export function registerWebhook(automationId: string, path: string): void {
  const now = Date.now();
  testWebhooks.set(`${automationId}:${path}`, {
    automationId,
    path,
    registeredAt: now,
    expiresAt: now + TEST_WEBHOOK_TTL_MS,
  });
}

export async function handleWebhookRequest(
  db: Database,
  dispatcher: AgentDispatcher,
  automationId: string,
  path: string,
  req: Request,
  mode: "test" | "prod",
): Promise<Response> {
  if (mode === "test") {
    const entry = testWebhooks.get(`${automationId}:${path}`);
    if (!entry) {
      return new Response(
        JSON.stringify({ error: "Webhook not registered for testing" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (Date.now() > entry.expiresAt) {
      testWebhooks.delete(`${automationId}:${path}`);
      return new Response(JSON.stringify({ error: "Test webhook expired" }), {
        status: 410,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (mode === "prod") {
    const automation = getAutomation(db, automationId);
    if (!automation || !automation.activeVersionId) {
      return new Response(
        JSON.stringify({ error: "Automation not found or not active" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  const auto = getAutomation(db, automationId);
  const version = auto?.activeVersionId
    ? db
        .query<
          { definition_json: string },
          [string]
        >("SELECT definition_json FROM automation_versions WHERE id=?")
        .get(auto.activeVersionId)
    : null;
  const definition: AutomationDefinition | null =
    mode === "prod"
      ? version
        ? JSON.parse(version.definition_json)
        : null
      : (auto?.draft ?? null);
  const trigger = definition?.nodes.find(
    (n) =>
      !n.disabled && n.type === "trigger.webhook" && n.params.path === path,
  );
  if (!trigger)
    return Response.json({ error: "Webhook not found" }, { status: 404 });
  if (String(trigger.params.method ?? "POST").toUpperCase() !== req.method)
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  let body: Record<string, unknown> = {};
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      body = (await req.json()) as Record<string, unknown>;
    } else {
      const text = await req.text();
      body = { raw: text };
    }
  } catch {
    body = {};
  }

  const triggerData: NodeItem[] = [
    {
      json: {
        webhookPath: path,
        method: req.method,
        headers: Object.fromEntries(
          [...req.headers.entries()].filter(
            ([key]) => !["authorization", "cookie"].includes(key),
          ),
        ),
        body,
        triggeredAt: new Date().toISOString(),
      },
    },
  ];

  const options: RunOptions = {
    mode: mode === "prod" ? "trigger" : "manual",
    triggerNodeId: trigger.id,
    triggerData,
  };

  const id = randomUUID();
  const work = runAutomation(db, dispatcher, automationId, {
    ...options,
    runId: id,
  });
  const run = dispatcher.getRun(id);
  if (!run) await work;
  else void work.catch((error) => console.error("Webhook run failed", error));
  if (!run) {
    return new Response(JSON.stringify({ error: "Failed to create run" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ runId: run.id, status: "triggered" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function clearTestWebhooks(): void {
  testWebhooks.clear();
}
