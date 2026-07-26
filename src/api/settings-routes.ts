import type { Database } from "bun:sqlite";
import { getAiSettings, setAiSettings } from "../core/ai-settings.js";

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

export function handleGetSettings(db: Database): Response {
  const settings = getAiSettings(db);

  const maskedKey = settings.apiKey
    ? (settings.apiKey.length <= 8 ? "****" : settings.apiKey.slice(0, 4) + "****" + settings.apiKey.slice(-4))
    : null;

  return json({
    aiApiKey: maskedKey,
    aiModel: settings.model,
    aiEndpoint: settings.endpoint,
    hasApiKey: settings.apiKey !== null,
  });
}

export async function handleUpdateSettings(
  db: Database,
  req: Request,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      aiApiKey?: string;
      aiModel?: string;
      aiEndpoint?: string;
    };

    const updates: { apiKey?: string; model?: string; endpoint?: string } = {};

    if (body.aiApiKey !== undefined) {
      if (body.aiApiKey === "") {
        updates.apiKey = "";
      } else {
        const current = getAiSettings(db);
        if (
          body.aiApiKey.includes("****") &&
          current.apiKey
        ) {
          updates.apiKey = current.apiKey;
        } else {
          updates.apiKey = body.aiApiKey;
        }
      }
    }

    if (body.aiModel !== undefined) updates.model = body.aiModel;
    if (body.aiEndpoint !== undefined) updates.endpoint = body.aiEndpoint;

    setAiSettings(db, updates);

    return handleGetSettings(db);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
}
