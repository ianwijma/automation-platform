import { createHash } from "node:crypto";
import { z } from "zod";
const revision = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
import type { Database } from "bun:sqlite";
import type { AiChatRequest, AiApplyRequest } from "../core/api-types.js";
import { AiService } from "./ai-service.js";
import { getAiSettings } from "../core/ai-settings.js";
import { getAutomation, updateAutomation } from "./automations.js";

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

export async function handleAiChat(
  db: Database,
  req: Request,
): Promise<Response> {
  try {
    const body = z
      .object({
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().max(100_000),
            }),
          )
          .min(1)
          .max(100),
        automationId: z.string().optional(),
        model: z.string().min(1).optional(),
      })
      .parse(await req.json());
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
    return json({
      ...result,
      baseRevision: automation ? revision(automation) : undefined,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "AI service error" },
      400,
    );
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

    if (body.baseRevision !== revision(autoResp.draft))
      return json({ error: "Draft changed; request a fresh AI proposal" }, 409);
    const newDefinition = AiService.applyDiffs(autoResp.draft, body.diffs);
    const updated = updateAutomation(db, body.automationId, newDefinition);
    if (!updated) {
      return json({ error: "Failed to update automation" }, 500);
    }

    return json({
      automationId: body.automationId,
      definition: newDefinition,
      revision: updated.revision,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "AI service error" },
      400,
    );
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
  } catch {
    return json({ error: "Failed to list models" }, 500);
  }
}
