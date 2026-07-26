import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import type { AppConfig } from "../cli/config.js";
import { WssAgentClient } from "./wss-client.js";

interface AgentConfig {
  serverUrl: string;
  token: string;
  enrolledAt: string;
}

export async function startFleetAgent(config: AppConfig): Promise<void> {
  const agentConfigPath = join(config.dataDir, "agent.json");

  if (!existsSync(agentConfigPath)) {
    console.error("Agent not enrolled. Run: ap join <url> --token <tok>");
    process.exit(1);
  }

  const agentConfig: AgentConfig = JSON.parse(readFileSync(agentConfigPath, "utf-8"));

  const version = "0.1.0";
  const name = process.env.AP_AGENT_NAME ?? `agent-${hostname()}`;

  const client = new WssAgentClient({
    name,
    version,
    token: agentConfig.token,
  });

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("Shutting down fleet agent...");
    client.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  client.setOnDisconnected(() => {
    if (shuttingDown) return;
    console.log("Disconnected from platform");
  });

  try {
    const wsUrl = agentConfig.serverUrl.replace(/\/$/, "");
    await client.connect(wsUrl);
    console.log(`Fleet agent connected: ${client.getAgentId()}`);
  } catch (err: any) {
    console.error(`Failed to connect: ${err?.message ?? err}`);
    process.exit(1);
  }

  await new Promise(() => {});
}
