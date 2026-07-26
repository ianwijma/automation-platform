import type { Database } from "bun:sqlite";
import type { AiChatRequest, AiApplyRequest } from "../core/api-types.js";
import { AiService } from "./ai-service.js";
import { getAiSettings } from "../core/ai-settings.js";
import { getAutomation, updateAutomation } from "./automations.js";

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

export async function handleAiChat(
  db: Database,
  req: Request,
): Promise<Response> {
  try {
    const body = (await req.json()) as AiChatRequest;
    const settings = getAiSettings(db);

    if (!settings.apiKey) {
      return json({ error: "AI API key not configured" }, 400);
    }

    const model = body.model ?? settings.model;
    const service = new AiService(
      settings.apiKey,
      model,
      settings.endpoint ?? undefined,
    );

    let automation = undefined;
    if (body.automationId) {
      const autoResp = getAutomation(db, body.automationId);
      if (autoResp?.draft) {
        automation = autoResp.draft;
      }
    }

    const result = await service.chat(body.messages, automation);
    return json(result);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function handleAiApply(
  db: Database,
  req: Request,
): Promise<Response> {
  try {
    const body = (await req.json()) as AiApplyRequest;
    const autoResp = getAutomation(db, body.automationId);
    if (!autoResp || !autoResp.draft) {
      return json({ error: "Automation not found" }, 404);
    }

    const newDefinition = AiService.applyDiffs(autoResp.draft, body.diffs);
    const updated = updateAutomation(db, body.automationId, newDefinition);
    if (!updated) {
      return json({ error: "Failed to update automation" }, 500);
    }

    return json({ automationId: body.automationId, definition: newDefinition });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function handleAiModels(
  db: Database,
  _req: Request,
): Promise<Response> {
  try {
    const settings = getAiSettings(db);
    if (!settings.apiKey) {
      return json({ error: "AI API key not configured" }, 400);
    }

    const service = new AiService(
      settings.apiKey,
      settings.model,
      settings.endpoint ?? undefined,
    );
    const models = await service.listModels();
    return json({ models });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
