import { describe, test, expect, beforeEach } from "bun:test";
import { resolveConfig, type AppConfig } from "./config.js";

describe("AppConfig", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("AP_")) delete process.env[key];
    }
  });

  test("creates config with default values", () => {
    const config = resolveConfig([]);
    expect(config.port).toBe(7480);
    expect(config.mode).toBe("standalone");
    expect(config.noBrowser).toBe(false);
    expect(config.publicUrl).toBeNull();
  });

  test("port setting via --port flag", () => {
    const config = resolveConfig(["--port", "3000"]);
    expect(config.port).toBe(3000);
  });

  test("host defaults to 127.0.0.1 for standalone", () => {
    const config = resolveConfig([]);
    expect(config.host).toBe("127.0.0.1");
  });

  test("host defaults to 0.0.0.0 for platform mode", () => {
    const config = resolveConfig(["serve"], "platform");
    expect(config.host).toBe("0.0.0.0");
  });

  test("host defaults to 0.0.0.0 for agent mode", () => {
    const config = resolveConfig([], "agent");
    expect(config.host).toBe("0.0.0.0");
  });

  test("dataDir defaults to expanded home", () => {
    const config = resolveConfig([]);
    expect(config.dataDir).toContain(process.env.HOME || "/tmp");
    expect(config.dataDir).toContain(".config/ap");
  });

  test("logLevel is not directly in config (mode covers it)", () => {
    const config = resolveConfig([]);
    expect(config.mode).toBeDefined();
  });

  test("AP_PORT environment variable override", () => {
    process.env.AP_PORT = "9999";
    const config = resolveConfig([]);
    expect(config.port).toBe(9999);
    delete process.env.AP_PORT;
  });

  test("AP_HOST environment variable override", () => {
    process.env.AP_HOST = "192.168.1.1";
    const config = resolveConfig([]);
    expect(config.host).toBe("192.168.1.1");
    delete process.env.AP_HOST;
  });

  test("AP_DATA_DIR environment variable override", () => {
    process.env.AP_DATA_DIR = "/tmp/test-ap-data";
    const config = resolveConfig([]);
    expect(config.dataDir).toBe("/tmp/test-ap-data");
    delete process.env.AP_DATA_DIR;
  });

  test("AP_NO_BROWSER environment variable override", () => {
    process.env.AP_NO_BROWSER = "1";
    const config = resolveConfig([]);
    expect(config.noBrowser).toBe(true);
    delete process.env.AP_NO_BROWSER;
  });

  test("AP_PUBLIC_URL promotes standalone to platform", () => {
    process.env.AP_PUBLIC_URL = "https://my.ap.example.com";
    const config = resolveConfig([]);
    expect(config.mode).toBe("platform");
    expect(config.publicUrl).toBe("https://my.ap.example.com");
    delete process.env.AP_PUBLIC_URL;
  });

  test("--public-url promotes standalone to platform", () => {
    const config = resolveConfig(["--public-url", "https://pub.example.com"]);
    expect(config.mode).toBe("platform");
    expect(config.publicUrl).toBe("https://pub.example.com");
  });

  test("--no-browser flag", () => {
    const config = resolveConfig(["--no-browser"]);
    expect(config.noBrowser).toBe(true);
  });

  test("dbPath is derived from dataDir", () => {
    const config = resolveConfig([]);
    expect(config.dbPath).toBe(`${config.dataDir}/ap.db`);
  });

  test("agent subcommand sets mode", () => {
    const config = resolveConfig([], "agent");
    expect(config.mode).toBe("agent");
  });
});
