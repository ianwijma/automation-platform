import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";

export interface TestServerResult {
  url: string;
  dataDir: string;
  close: () => Promise<void>;
}

const SERVER_SCRIPT = (projectDir: string) => `
import { createDatabase } from "${projectDir}/src/db/database.js";
import { createServer } from "${projectDir}/src/api/server.js";
import { resolveConfig } from "${projectDir}/src/cli/config.js";
import { setAiSettings } from "${projectDir}/src/core/ai-settings.js";
import "${projectDir}/src/nodes/index.js";
import { mkdirSync } from "node:fs";

const dataDir = process.env.AP_E2E_DATA_DIR!;
mkdirSync(dataDir, { recursive: true });

const config = resolveConfig(["--port", "0", "--no-browser"]);
config.dataDir = dataDir;
config.dbPath = dataDir + "/ap.db";
config.noBrowser = true;

const db = createDatabase(config.dbPath);
const { server, close } = createServer({ port: 0, host: "127.0.0.1", db, config });

const port = server.port;

const provider = process.env.AP_E2E_AI_REPLY ? Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => Response.json(request.url.endsWith("/models") ? { data: [{ id: "fixture" }] } : { choices: [{ message: { content: process.env.AP_E2E_AI_REPLY } }] }) }) : null;
setAiSettings(db.db, { apiKey: "test-key", model: "fixture", endpoint: provider ? "http://127.0.0.1:" + provider.port + "/v1" : "http://127.0.0.1:1/v1" });

process.on("SIGTERM", async () => { await close(); provider?.stop(true); process.exit(0); });

process.stdout.write("AP_E2E_READY " + port + "\\n");


`;

export async function startTestServer(
  options: { adminToken?: string; aiReply?: string; display?: string } = {},
): Promise<TestServerResult> {
  const dataDir = `/tmp/ap-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(dataDir, { recursive: true });

  const scriptPath = join(dataDir, "e2e-server.ts");
  writeFileSync(scriptPath, SERVER_SCRIPT(process.cwd()));

  const proc = spawn("bun", ["run", scriptPath], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(options.display === undefined
        ? {}
        : {
            DISPLAY: options.display,
            WAYLAND_DISPLAY: "",
            XDG_SESSION_TYPE: "x11",
          }),
      AP_E2E_DATA_DIR: dataDir,
      AP_ADMIN_TOKEN: options.adminToken ?? "",
      AP_E2E_AI_REPLY: options.aiReply ?? "",
      AP_HOST: "127.0.0.1",
      AP_PUBLIC_URL: "",
      AP_MASTER_KEY: "",
    },
  });

  const port = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("Server startup timeout"));
    }, 20000);

    let output = "";
    proc.stdout!.on("data", (data: Buffer) => {
      output += data.toString();
      const match = output.match(/AP_E2E_READY (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1], 10));
      }
    });

    let errOutput = "";
    proc.stderr!.on("data", (data: Buffer) => {
      errOutput += data.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}: ${errOutput}`));
      }
    });
  });

  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    dataDir,
    close: async () => {
      const stopped = new Promise<void>((resolve) =>
        proc.once("exit", () => resolve()),
      );
      proc.kill("SIGTERM");
      const timer = setTimeout(() => proc.kill("SIGKILL"), 7000);
      await stopped;
      clearTimeout(timer);
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {}
    },
  };
}
