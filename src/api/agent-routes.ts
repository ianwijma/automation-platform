import { createHash, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { WssHub } from "./wss-hub.js";

interface AgentRow {
  id: string;
  name: string;
  is_local: number;
  tags_json: string;
  capabilities_json: string;
  version: string;
  status: string;
  last_seen_at: string | null;
  enrolled_at: string;
}

export function listAgents(db: Database, hub: WssHub): Response {
  const onlineAgents = hub.getConnectedAgents();
  const onlineIds = new Set(onlineAgents.map((a) => a.agentId));

  const rows = db
    .query<AgentRow, []>("SELECT * FROM agents ORDER BY enrolled_at DESC")
    .all();

  const agents = rows.map((row) => {
    const online = row.is_local === 1 || onlineIds.has(row.id);
    const live = onlineAgents.find((a) => a.agentId === row.id);

    return {
      id: row.id,
      name: row.name,
      isLocal: row.is_local === 1,
      tags: JSON.parse(row.tags_json),
      capabilities: live
        ? live.capabilities
        : JSON.parse(row.capabilities_json),
      version: live ? live.version : row.version,
      status: online ? ("online" as const) : ("offline" as const),
      lastSeenAt: row.last_seen_at,
      enrolledAt: row.enrolled_at,
    };
  });

  return Response.json(agents);
}

export function createJoinToken(
  db: Database,
  body: { uses?: number; ttlHours?: number },
): Response {
  const uses = body.uses ?? 1;
  const ttlHours = body.ttlHours ?? 72;
  if (
    !Number.isInteger(uses) ||
    uses < 1 ||
    uses > 100 ||
    !Number.isFinite(ttlHours) ||
    ttlHours <= 0 ||
    ttlHours > 720
  )
    return Response.json({ error: "Invalid token limits" }, { status: 400 });
  const token = randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  db.prepare(
    "INSERT INTO join_tokens (token_hash, uses_left, expires_at) VALUES (?, ?, ?)",
  ).run(tokenHash, uses, expiresAt);

  return Response.json({ token, usesLeft: uses, expiresAt }, { status: 201 });
}

export function triggerAgentUpdate(hub: WssHub, agentId: string): Response {
  return Response.json(
    {
      error:
        "Automatic updates are disabled; install a verified release manually",
    },
    { status: 409 },
  );
}

export function updateAgentTags(
  db: Database,
  hub: WssHub,
  agentId: string,
  tags: string[],
): Response {
  const existing = db
    .query<AgentRow, [string]>("SELECT * FROM agents WHERE id = ?")
    .get(agentId);
  if (!existing) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  db.prepare("UPDATE agents SET tags_json = ? WHERE id = ?").run(
    JSON.stringify(tags),
    agentId,
  );
  hub.updateAgentTags(agentId, tags);

  return Response.json({ id: agentId, tags });
}
