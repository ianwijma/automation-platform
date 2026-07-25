import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "../db/database.js";
import { createServer } from "../api/server.js";
import { resolveConfig, type AppConfig } from "./config.js";
import { openBrowser } from "./utils.js";
import { parseCliFlags } from "./flags.js";

function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
}

function startServer(config: AppConfig): void {
  ensureDataDir(config.dataDir);
  const db = createDatabase(config.dbPath);

  const { server } = createServer({
    port: config.port,
    host: config.host,
    db,
    config,
  });

  if (!config.noBrowser && config.mode !== "agent") {
    const url = `http://localhost:${config.port}`;
    openBrowser(url);
  }

  console.log(
    `AP_READY http://127.0.0.1:${server.port}`,
  );
}

function handleJoin(args: string[], flags: { token?: string }): void {
  const config = resolveConfig(args, "agent");
  ensureDataDir(config.dataDir);

  const serverUrl = flags.token ? args[0] : undefined;
  const token = flags.token;

  if (!serverUrl || !token) {
    console.error("Usage: ap join <url> --token <tok>");
    process.exit(1);
  }

  const agentConfigPath = join(config.dataDir, "agent.json");
  const agentConfig = {
    serverUrl,
    token,
    enrolledAt: new Date().toISOString(),
  };

  writeFileSync(agentConfigPath, JSON.stringify(agentConfig, null, 2), "utf-8");
  console.log("Agent enrolled");
}

function handleUi(args: string[]): void {
  const config = resolveConfig(args);
  const url = `http://localhost:${config.port}`;
  const opened = openBrowser(url);
  if (!opened) {
    console.error(`Could not open browser. Open manually: ${url}`);
    process.exit(1);
  }
}

function handleDoctor(): void {
  console.log("Capability probe not yet implemented");
}

function handleInstallService(): void {
  console.log("Service install not yet implemented");
}

export function parseArgs(argv: string[]): void {
  const flags = parseCliFlags(argv);
  const args = flags.rest;
  const subcommand = args[0];

  switch (subcommand) {
    case "serve": {
      const config = resolveConfig(argv, "platform");
      startServer(config);
      break;
    }

    case "join": {
      const joinArgs = args.slice(1);
      handleJoin(joinArgs, { token: flags.token });
      break;
    }

    case "ui": {
      const uiArgs = args.slice(1).filter((a) => !a.startsWith("--token"));
      handleUi(uiArgs);
      break;
    }

    case "doctor": {
      handleDoctor();
      break;
    }

    case "install-service": {
      handleInstallService();
      break;
    }

    case undefined: {
      const config = resolveConfig(argv, "standalone");
      startServer(config);
      break;
    }

    default: {
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error(
        "Usage: ap [serve] [--port N] [--public-url URL] [--no-browser] | ap join <url> --token <tok> | ap ui | ap doctor | ap install-service",
      );
      process.exit(1);
    }
  }
}
