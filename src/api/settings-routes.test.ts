import { getAiSettings, setAiSettings } from "../core/ai-settings.js";
import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { handleGetSettings, handleUpdateSettings } from "./settings-routes.js";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(MIGRATION_SQL);
  return db;
}

describe("handleGetSettings", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("returns default settings when no keys set", () => {
    const res = handleGetSettings(db);
    expect(res.status).toBe(200);
    return res.json().then((body: any) => {
      expect(body.aiApiKey).toBeNull();
      expect(body.aiModel).toBe("openai/gpt-4o-mini");
      expect(body.aiEndpoint).toBeNull();
      expect(body.hasApiKey).toBe(false);
    });
  });

  test("masks API key in response", () => {
    setAiSettings(db, { apiKey: "sk-abcdef1234567890xyz" });
    const res = handleGetSettings(db);
    return res.json().then((body: any) => {
      expect(body.aiApiKey).toBe("sk-a****0xyz");
      expect(body.hasApiKey).toBe(true);
    });
  });

  test("returns model when set", () => {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "ai_model",
      "anthropic/claude-3",
    );
    const res = handleGetSettings(db);
    return res.json().then((body: any) => {
      expect(body.aiModel).toBe("anthropic/claude-3");
    });
  });

  test("returns endpoint when set", () => {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "ai_endpoint",
      "https://custom.api/v1",
    );
    const res = handleGetSettings(db);
    return res.json().then((body: any) => {
      expect(body.aiEndpoint).toBe("https://custom.api/v1");
    });
  });

  test("hasApiKey is false for an empty key", () => {
    setAiSettings(db, { apiKey: "" });
    const res = handleGetSettings(db);
    return res.json().then((body: any) => {
      expect(body.aiApiKey).toBeNull();
      expect(body.hasApiKey).toBe(false);
    });
  });
});

describe("handleUpdateSettings", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  test("writes API key to DB", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiApiKey: "sk-new-key-1234567890ab" }),
    });
    const res = await handleUpdateSettings(db, req);
    expect(res.status).toBe(200);

    const row = db
      .query<
        { value: string },
        [string]
      >("SELECT value FROM settings WHERE key = ?")
      .get("ai_api_key");
    expect(row).not.toBeNull();
    expect(row!.value).toStartWith("enc:v1:");
    expect(row!.value).not.toContain("sk-new-key");
    expect(getAiSettings(db).apiKey).toBe("sk-new-key-1234567890ab");
  });

  test("writes model to DB", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiModel: "openai/gpt-4o" }),
    });
    const res = await handleUpdateSettings(db, req);
    expect(res.status).toBe(200);

    const row = db
      .query<
        { value: string },
        [string]
      >("SELECT value FROM settings WHERE key = ?")
      .get("ai_model");
    expect(row!.value).toBe("openai/gpt-4o");
  });

  test("writes endpoint to DB", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiEndpoint: "https://my-llm.example.com/v1" }),
    });
    const res = await handleUpdateSettings(db, req);
    expect(res.status).toBe(200);

    const row = db
      .query<
        { value: string },
        [string]
      >("SELECT value FROM settings WHERE key = ?")
      .get("ai_endpoint");
    expect(row!.value).toBe("https://my-llm.example.com/v1");
  });

  test("preserves current key when masked value sent", async () => {
    setAiSettings(db, { apiKey: "sk-orig-key-1234567890cd" });

    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiApiKey: "sk-o****90cd" }),
    });
    const res = await handleUpdateSettings(db, req);
    expect(res.status).toBe(200);

    const row = db
      .query<
        { value: string },
        [string]
      >("SELECT value FROM settings WHERE key = ?")
      .get("ai_api_key");
    expect(getAiSettings(db).apiKey).toBe("sk-orig-key-1234567890cd");
  });

  test("clears API key when empty string sent", async () => {
    setAiSettings(db, { apiKey: "sk-old-key" });

    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiApiKey: "" }),
    });
    const res = await handleUpdateSettings(db, req);
    expect(res.status).toBe(200);

    const row = db
      .query<
        { value: string },
        [string]
      >("SELECT value FROM settings WHERE key = ?")
      .get("ai_api_key");
    expect(row!.value).toBe("");
  });

  test("returns 400 for invalid request body", async () => {
    const req = new Request("http://localhost/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleUpdateSettings(db, req);
    expect(res.status).toBe(400);
  });
});
