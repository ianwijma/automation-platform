import { expect, test } from "bun:test";
import { createDatabase } from "../db/database.js";
import {
  createAutomation,
  activateAutomation,
  deactivateAutomation,
} from "./automations.js";
import { AgentDispatcher } from "../agent/dispatcher.js";
import { TriggerManager } from "./trigger-manager.js";
import type { AutomationDefinition } from "../core/types.js";
import "../nodes/index.js";
const definition = (
  type: string,
  params: Record<string, unknown>,
): AutomationDefinition => ({
  schemaVersion: 1,
  name: "Background",
  settings: { runTimeoutSec: 10, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "trigger",
      type,
      typeVersion: 1,
      name: "Trigger",
      params,
      target: { kind: "local" },
      disabled: false,
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
});
test("real cron fires only an active version and deactivation stops it", async () => {
  const db = createDatabase(":memory:"),
    dispatcher = new AgentDispatcher();
  dispatcher.attachDatabase(db.db);
  const triggers = new TriggerManager(db.db, dispatcher);
  try {
    const auto = createAutomation(
      db.db,
      "Cron",
      definition("trigger.schedule", { cron: "* * * * * *", timezone: "UTC" }),
    );
    activateAutomation(db.db, auto.id);
    triggers.start();
    for (let i = 0; i < 70 && !dispatcher.getAllRuns().length; i++)
      await Bun.sleep(20);
    expect(dispatcher.getAllRuns()).toHaveLength(1);
    expect(dispatcher.getAllRuns()[0].status).toBe("success");
    deactivateAutomation(db.db, auto.id);
    triggers.sync();
    await Bun.sleep(1100);
    expect(dispatcher.getAllRuns()).toHaveLength(1);
  } finally {
    triggers.stop();
    await dispatcher.shutdown();
    db.close();
  }
});
test("stopAfter stops producing polling runs", async () => {
  const db = createDatabase(":memory:"),
    dispatcher = new AgentDispatcher();
  dispatcher.attachDatabase(db.db);
  const triggers = new TriggerManager(db.db, dispatcher);
  try {
    const auto = createAutomation(
      db.db,
      "Poll",
      definition("trigger.polling", {
        targetType: "command",
        target: "printf fixed",
        intervalSec: 0.1,
        stopAfter: 2,
      }),
    );
    activateAutomation(db.db, auto.id);
    triggers.start();
    await Bun.sleep(550);
    expect(dispatcher.getAllRuns()).toHaveLength(2);
    expect(dispatcher.getState(auto.id, "polling:trigger:count")).toBe(2);
  } finally {
    triggers.stop();
    await dispatcher.shutdown();
    db.close();
  }
});
