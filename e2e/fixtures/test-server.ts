import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";

export interface TestServerResult {
  url: string;
  dataDir: string;
  close: () => void;
}

const SERVER_SCRIPT = (projectDir: string) => `
import { createDatabase } from "${projectDir}/src/db/database.js";
import { createServer } from "${projectDir}/src/api/server.js";
import { resolveConfig } from "${projectDir}/src/cli/config.js";
import { setAiSettings } from "${projectDir}/src/core/ai-settings.js";
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

setAiSettings(db.db, { apiKey: "test-key", model: "openai/gpt-4o-mini", endpoint: null });

process.stdout.write("AP_E2E_READY " + port + "\\n");

process.on("SIGTERM", () => { close(); process.exit(0); });
process.on("SIGINT", () => { close(); process.exit(0); });
`;

export async function startTestServer(): Promise<TestServerResult> {
  const dataDir = `/tmp/ap-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  mkdirSync(dataDir, { recursive: true });

  const scriptPath = join(dataDir, "e2e-server.ts");
  writeFileSync(scriptPath, SERVER_SCRIPT(process.cwd()));

  const proc = spawn("bun", ["run", scriptPath], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      AP_E2E_DATA_DIR: dataDir,
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
    close: () => {
      proc.kill("SIGTERM");
      try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
    },
  };
}
