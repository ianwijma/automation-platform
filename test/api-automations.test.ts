import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createDatabase } from "../src/db/database.js";
import type { AppDatabase } from "../src/db/database.js";
import { createAutomation, getAutomation, listAutomations, updateAutomation, deleteAutomation, activateAutomation, deactivateAutomation } from "../src/api/automations.js";
import type { AutomationDefinition } from "../src/core/types.js";
import "../src/nodes/index.js";

const TEST_DEFINITION: AutomationDefinition = {
  schemaVersion: 1,
  name: "Test",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1", type: "trigger.manual", typeVersion: 1, name: "Start",
      target: { kind: "local" }, params: {}, disabled: false, position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("Automation CRUD API", () => {
  let db: AppDatabase;

  beforeAll(() => {
    db = createDatabase(":memory:");
  });

  afterAll(() => {
    db.close();
  });

  test("create automation", () => {
    const result = createAutomation(db.db, "My Automation", TEST_DEFINITION);
    expect(result.id).toBeDefined();
    expect(result.name).toBe("My Automation");
    expect(result.draft).not.toBeNull();
    expect(result.activeVersionId).toBeNull();
  });

  test("get automation", () => {
    const created = createAutomation(db.db, "Get Test", TEST_DEFINITION);
    const result = getAutomation(db.db, created.id);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Get Test");
  });

  test("list automations", () => {
    createAutomation(db.db, "List A", TEST_DEFINITION);
    createAutomation(db.db, "List B", TEST_DEFINITION);
    const result = listAutomations(db.db);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test("update automation creates new version", () => {
    const created = createAutomation(db.db, "Update Test", TEST_DEFINITION);
    const updated = updateAutomation(db.db, created.id, { ...TEST_DEFINITION, name: "Updated" });
    expect(updated).not.toBeNull();
    expect(updated!.draft!.name).toBe("Updated");
  });

  test("delete automation", () => {
    const created = createAutomation(db.db, "Delete Test", TEST_DEFINITION);
    const deleted = deleteAutomation(db.db, created.id);
    expect(deleted).toBe(true);
    const result = getAutomation(db.db, created.id);
    expect(result).toBeNull();
  });

  test("activate automation sets active version", () => {
    const created = createAutomation(db.db, "Activate Test", TEST_DEFINITION);
    expect(created.activeVersionId).toBeNull();
    const activated = activateAutomation(db.db, created.id);
    expect(activated).not.toBeNull();
    expect(activated!.activeVersionId).not.toBeNull();
  });

  test("deactivate automation clears active version", () => {
    const created = createAutomation(db.db, "Deactivate Test", TEST_DEFINITION);
    activateAutomation(db.db, created.id);
    const deactivated = deactivateAutomation(db.db, created.id);
    expect(deactivated).not.toBeNull();
    expect(deactivated!.activeVersionId).toBeNull();
  });

  test("get nonexistent automation returns null", () => {
    const result = getAutomation(db.db, "nonexistent-id");
    expect(result).toBeNull();
  });

  test("delete nonexistent automation returns false", () => {
    const result = deleteAutomation(db.db, "nonexistent-id");
    expect(result).toBe(false);
  });
});
