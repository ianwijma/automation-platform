import { test, expect } from "../fixtures/base.js";

const SIMPLE_DEFINITION = {
  schemaVersion: 1,
  name: "Schedule Test",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1",
      type: "trigger.schedule",
      typeVersion: 1,
      name: "Every Minute",
      target: { kind: "local" },
      params: { cron: "* * * * *", timezone: "UTC" },
      disabled: false,
      position: { x: 0, y: 0 },
    },
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "Scheduled Task",
      target: { kind: "local" },
      params: { command: "echo scheduled" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
};

const WEBHOOK_DEFINITION = {
  schemaVersion: 1,
  name: "Webhook Test",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1",
      type: "trigger.webhook",
      typeVersion: 1,
      name: "Webhook Trigger",
      target: { kind: "local" },
      params: { path: "incoming", method: "POST" },
      disabled: false,
      position: { x: 0, y: 0 },
    },
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "Process",
      target: { kind: "local" },
      params: { command: "echo processed" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
};

const POLLING_DEFINITION = {
  schemaVersion: 1,
  name: "Polling Test",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1",
      type: "trigger.polling",
      typeVersion: 1,
      name: "Poll",
      target: { kind: "local" },
      params: { intervalSec: 60, targetType: "command", target: "echo ok", stopAfter: 0 },
      disabled: false,
      position: { x: 0, y: 0 },
    },
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "Handle",
      target: { kind: "local" },
      params: { command: "echo change" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
};

test.describe("Trigger Execution", () => {
  test("schedule trigger: create automation with schedule, verify it's registered", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Schedule Test", definition: SIMPLE_DEFINITION },
    });
    expect(createResp.status()).toBe(201);
    const automation = await createResp.json();

    const getResp = await request.get(`${testServer.url}/api/automations/${automation.id}`);
    expect(getResp.ok()).toBeTruthy();
    const body = await getResp.json();
    expect(body.draft.nodes[0].type).toBe("trigger.schedule");
    expect(body.draft.nodes[0].params.cron).toBe("* * * * *");
  });

  test("webhook test mode: unregistered test webhook returns 404", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Webhook Test", definition: WEBHOOK_DEFINITION },
    });
    const automation = await createResp.json();

    const hookResp = await request.post(`${testServer.url}/hooks/test/${automation.id}/incoming`, {
      data: { test: true },
    });
    expect(hookResp.status()).toBe(404);
  });

  test("webhook prod mode: active automation with webhook triggers a run", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Webhook Prod Test", definition: WEBHOOK_DEFINITION },
    });
    const automation = await createResp.json();

    const activateResp = await request.post(`${testServer.url}/api/automations/${automation.id}/activate`);
    expect(activateResp.ok()).toBeTruthy();

    const hookResp = await request.post(`${testServer.url}/hooks/${automation.id}/incoming`, {
      data: { payload: "test" },
    });
    expect(hookResp.ok()).toBeTruthy();
    const body = await hookResp.json();
    expect(body).toHaveProperty("runId");
    expect(body.status).toBe("triggered");
  });

  test("webhook prod mode: inactive automation returns 404", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Inactive Webhook", definition: WEBHOOK_DEFINITION },
    });
    const automation = await createResp.json();

    const hookResp = await request.post(`${testServer.url}/hooks/${automation.id}/incoming`, {
      data: { payload: "test" },
    });
    expect(hookResp.status()).toBe(404);
  });

  test("polling trigger: create automation with polling config, verify activation", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Polling Test", definition: POLLING_DEFINITION },
    });
    expect(createResp.status()).toBe(201);
    const automation = await createResp.json();

    const activateResp = await request.post(`${testServer.url}/api/automations/${automation.id}/activate`);
    expect(activateResp.ok()).toBeTruthy();

    const getResp = await request.get(`${testServer.url}/api/automations/${automation.id}`);
    const body = await getResp.json();
    expect(body.draft.nodes[0].type).toBe("trigger.polling");
    expect(body.activeVersionId).toBeTruthy();
  });
});
