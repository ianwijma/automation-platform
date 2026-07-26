import { describe, test, expect, beforeEach } from "bun:test";
import { createDatabase, AppDatabase } from "../db/database.js";
import { getAiSettings, setAiSettings } from "./ai-settings.js";

describe("getAiSettings", () => {
  let db: AppDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  test("returns nulls/defaults when no settings are set", () => {
    const settings = getAiSettings(db.db);
    expect(settings.apiKey).toBeNull();
    expect(settings.model).toBe("openai/gpt-4o-mini");
    expect(settings.endpoint).toBeNull();
  });

  test("returns correct values after setAiSettings", () => {
    setAiSettings(db.db, {
      apiKey: "sk-test-key",
      model: "openai/gpt-4o",
      endpoint: "https://custom.api/v1",
    });

    const settings = getAiSettings(db.db);
    expect(settings.apiKey).toBe("sk-test-key");
    expect(settings.model).toBe("openai/gpt-4o");
    expect(settings.endpoint).toBe("https://custom.api/v1");
  });

  test("partial update only updates provided fields", () => {
    setAiSettings(db.db, {
      apiKey: "sk-original",
      model: "openai/gpt-4o-mini",
    });

    setAiSettings(db.db, { apiKey: "sk-updated" });

    const settings = getAiSettings(db.db);
    expect(settings.apiKey).toBe("sk-updated");
    expect(settings.model).toBe("openai/gpt-4o-mini");
    expect(settings.endpoint).toBeNull();
  });

  test("setAiSettings with empty object does nothing", () => {
    const before = getAiSettings(db.db);
    setAiSettings(db.db, {});
    const after = getAiSettings(db.db);
    expect(after).toEqual(before);
  });

  test("setAiSettings overwrites existing values", () => {
    setAiSettings(db.db, { apiKey: "sk-first", model: "model-a" });
    setAiSettings(db.db, { apiKey: "sk-second", model: "model-b" });

    const settings = getAiSettings(db.db);
    expect(settings.apiKey).toBe("sk-second");
    expect(settings.model).toBe("model-b");
  });

  test("endpoint can be set independently", () => {
    setAiSettings(db.db, { endpoint: "https://my-llm.local" });

    const settings = getAiSettings(db.db);
    expect(settings.endpoint).toBe("https://my-llm.local");
    expect(settings.apiKey).toBeNull();
    expect(settings.model).toBe("openai/gpt-4o-mini");
  });
});
