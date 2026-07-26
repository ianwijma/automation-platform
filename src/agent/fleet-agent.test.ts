import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { AppConfig } from "../cli/config.js";

describe("startFleetAgent", () => {
  test("startFleetAgent is importable and callable", async () => {
    const { startFleetAgent } = await import("./fleet-agent.js");
    expect(typeof startFleetAgent).toBe("function");
  });

  test("exits when agent.json does not exist", async () => {
    const { startFleetAgent } = await import("./fleet-agent.js");
    const tmpDir = `/tmp/ap-test-fleet-${Date.now()}`;
    const config: AppConfig = {
      mode: "agent",
      port: 7480,
      host: "0.0.0.0",
      dataDir: tmpDir,
      publicUrl: null,
      noBrowser: false,
      dbPath: `${tmpDir}/ap.db`,
    };

    const origExit = process.exit;
    const exitCalls: number[] = [];
    process.exit = ((code: number) => {
      exitCalls.push(code);
      throw new Error(`process.exit(${code})`);
    }) as any;

    try {
      await startFleetAgent(config);
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
      expect(exitCalls).toContain(1);
    } finally {
      process.exit = origExit;
    }
  });

  test("reads agent config from dataDir/agent.json", async () => {
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tmpDir = `/tmp/ap-test-fleet-read-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });

    const agentConfig = {
      serverUrl: "http://localhost:7480",
      token: "test-token-abc",
      enrolledAt: new Date().toISOString(),
    };
    writeFileSync(join(tmpDir, "agent.json"), JSON.stringify(agentConfig));

    const config: AppConfig = {
      mode: "agent",
      port: 7480,
      host: "0.0.0.0",
      dataDir: tmpDir,
      publicUrl: null,
      noBrowser: false,
      dbPath: `${tmpDir}/ap.db`,
    };

    const origExit = process.exit;
    process.exit = (() => {}) as any;

    try {
      const { startFleetAgent } = await import("./fleet-agent.js");

      const WssAgentClient = await import("./wss-client.js");
      const origConnect = WssAgentClient.WssAgentClient.prototype.connect;
      WssAgentClient.WssAgentClient.prototype.connect = async function (this: any) {
        this.agentId = "mock-agent-id";
        this.state = "connected";
      };

      const origOn = process.on;
      const sigHandlers: string[] = [];
      process.on = ((signal: string, handler: any) => {
        sigHandlers.push(signal);
        return process;
      }) as any;

      const startPromise = startFleetAgent(config);

      expect(sigHandlers).toContain("SIGTERM");
      expect(sigHandlers).toContain("SIGINT");

      WssAgentClient.WssAgentClient.prototype.connect = origConnect;
      process.on = origOn;

      rmSync(tmpDir, { recursive: true, force: true });
    } finally {
      process.exit = origExit;
    }
  });
});
