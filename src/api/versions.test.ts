import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createDatabase } from "../db/database.js";
import type { AppDatabase } from "../db/database.js";
import {
  createAutomation,
  updateAutomation,
} from "./automations.js";
import {
  listVersions,
  getVersion,
  revertToVersion,
  labelVersion,
} from "./versions.js";
import type { AutomationDefinition } from "../core/types.js";
import "../nodes/index.js";

const TEST_DEFINITION: AutomationDefinition = {
  schemaVersion: 1,
  name: "Test",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1",
      type: "trigger.manual",
      typeVersion: 1,
      name: "Start",
      target: { kind: "local" },
      params: {},
      disabled: false,
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

describe("Version management", () => {
  let db: AppDatabase;

  beforeAll(() => {
    db = createDatabase(":memory:");
  });

  afterAll(() => {
    db.close();
  });

  test("create automation, update 3 times, verify 3 versions exist", () => {
    const created = createAutomation(db.db, "Version Test", TEST_DEFINITION);
    expect(created.id).toBeDefined();

    const def2: AutomationDefinition = {
      ...TEST_DEFINITION,
      name: "Version 2",
      nodes: [
        ...TEST_DEFINITION.nodes,
        {
          id: "n2",
          type: "logic.delay",
          typeVersion: 1,
          name: "Delay",
          target: { kind: "local" },
          params: { delaySec: 5 },
          disabled: false,
          position: { x: 200, y: 0 },
        },
      ],
    };
    updateAutomation(db.db, created.id, def2);

    const def3: AutomationDefinition = {
      ...TEST_DEFINITION,
      name: "Version 3",
      nodes: [
        ...def2.nodes,
        {
          id: "n3",
          type: "logic.if",
          typeVersion: 1,
          name: "If",
          target: { kind: "local" },
          params: { condition: "true" },
          disabled: false,
          position: { x: 400, y: 0 },
        },
      ],
    };
    updateAutomation(db.db, created.id, def3);

    const def4: AutomationDefinition = {
      ...TEST_DEFINITION,
      name: "Version 4",
      nodes: [
        ...def3.nodes,
        {
          id: "n4",
          type: "logic.set",
          typeVersion: 1,
          name: "Set",
          target: { kind: "local" },
          params: { key: "value" },
          disabled: false,
          position: { x: 600, y: 0 },
        },
      ],
    };
    updateAutomation(db.db, created.id, def4);

    const versions = listVersions(db.db, created.id);
    expect(versions.length).toBe(4);
  });

  test("list versions returns all in reverse order", () => {
    const created = createAutomation(db.db, "Order Test", { ...TEST_DEFINITION, name: "Order Test" });
    updateAutomation(db.db, created.id, { ...TEST_DEFINITION, name: "V2" });
    updateAutomation(db.db, created.id, { ...TEST_DEFINITION, name: "V3" });

    const versions = listVersions(db.db, created.id);
    expect(versions.length).toBe(3);
    expect(versions[0].versionNo).toBe(3);
    expect(versions[1].versionNo).toBe(2);
    expect(versions[2].versionNo).toBe(1);
    expect(versions[0].definition.name).toBe("V3");
    expect(versions[2].definition.name).toBe("Order Test");
  });

  test("get specific version", () => {
    const created = createAutomation(db.db, "Get Version Test", { ...TEST_DEFINITION, name: "Get Version Test" });
    updateAutomation(db.db, created.id, { ...TEST_DEFINITION, name: "V2" });

    const v1 = getVersion(db.db, created.id, 1);
    expect(v1).not.toBeNull();
    expect(v1!.versionNo).toBe(1);
    expect(v1!.definition.name).toBe("Get Version Test");

    const v2 = getVersion(db.db, created.id, 2);
    expect(v2).not.toBeNull();
    expect(v2!.definition.name).toBe("V2");

    const v99 = getVersion(db.db, created.id, 99);
    expect(v99).toBeNull();
  });

  test("revert creates new version with old definition", () => {
    const created = createAutomation(db.db, "Revert Test", { ...TEST_DEFINITION, name: "Revert Test" });
    updateAutomation(db.db, created.id, { ...TEST_DEFINITION, name: "V2" });
    updateAutomation(db.db, created.id, { ...TEST_DEFINITION, name: "V3" });

    const versionsBefore = listVersions(db.db, created.id);
    expect(versionsBefore.length).toBe(3);

    const reverted = revertToVersion(db.db, created.id, 1);
    expect(reverted).not.toBeNull();
    expect(reverted!.draft!.name).toBe("Revert Test");

    const versionsAfter = listVersions(db.db, created.id);
    expect(versionsAfter.length).toBe(4);
    expect(versionsAfter[0].versionNo).toBe(4);
    expect(versionsAfter[0].definition.name).toBe("Revert Test");
  });

  test("label a version", () => {
    const created = createAutomation(db.db, "Label Test", TEST_DEFINITION);
    updateAutomation(db.db, created.id, { ...TEST_DEFINITION, name: "V2" });

    const versions = listVersions(db.db, created.id);
    expect(versions[0].label).toBeNull();

    const success = labelVersion(db.db, versions[0].id, "Stable Release");
    expect(success).toBe(true);

    const updated = listVersions(db.db, created.id);
    expect(updated[0].label).toBe("Stable Release");
  });

  test("label nonexistent version returns false", () => {
    const success = labelVersion(db.db, "nonexistent-id", "Label");
    expect(success).toBe(false);
  });

  test("revert nonexistent version returns null", () => {
    const result = revertToVersion(db.db, "nonexistent-id", 1);
    expect(result).toBeNull();
  });
});
