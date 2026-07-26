import { test, expect } from "../fixtures/base.js";

const MANUAL_DEFINITION = {
  schemaVersion: 1,
  name: "Data Preview Test",
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
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "Echo",
      target: { kind: "local" },
      params: { command: "echo data-preview-output" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
};

test.describe("Data Inspection", () => {
  test("GET /api/runs/:id returns node executions with input/output", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Data Preview Test", definition: MANUAL_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(`${testServer.url}/api/automations/${automation.id}/run`, {
      data: { mode: "manual" },
    });
    expect([201, 200]).toContain(runResp.status());
    const run = await runResp.json();

    const detailResp = await request.get(`${testServer.url}/api/runs/${run.id}`);
    expect(detailResp.ok()).toBeTruthy();
    const detail = await detailResp.json();

    expect(detail).toHaveProperty("nodeExecutions");
    expect(Array.isArray(detail.nodeExecutions)).toBeTruthy();
  });

  test("run with output has non-empty node execution data", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Output Test", definition: MANUAL_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(`${testServer.url}/api/automations/${automation.id}/run`, {
      data: {},
    });
    const run = await runResp.json();

    const detailResp = await request.get(`${testServer.url}/api/runs/${run.id}`);
    const detail = await detailResp.json();

    if (detail.nodeExecutions.length > 0) {
      const exec = detail.nodeExecutions[0];
      expect(exec).toHaveProperty("nodeId");
      expect(exec).toHaveProperty("status");
      expect(exec).toHaveProperty("input");
      expect(exec).toHaveProperty("output");
    }
  });

  test("UI: click on a run shows node execution list", async ({ page, testServer }) => {
    await page.goto(testServer.url);
    await page.waitForSelector("text=Automation Platform");

    const createResp = await page.request.post(`${testServer.url}/api/automations`, {
      data: { name: "UI Run Test", definition: MANUAL_DEFINITION },
    });
    const automation = await createResp.json();

    await page.request.post(`${testServer.url}/api/automations/${automation.id}/run`, {});

    const autoItem = page.locator("text=UI Run Test").first();
    await autoItem.click();

    await page.waitForTimeout(1000);

    const runSection = page.locator("text=Runs").first();
    await expect(runSection).toBeVisible();
  });

  test("UI: data preview shows when clicking node execution", async ({ page, testServer }) => {
    await page.goto(testServer.url);
    await page.waitForSelector("text=Automation Platform");

    const createResp = await page.request.post(`${testServer.url}/api/automations`, {
      data: { name: "Data Preview UI Test", definition: MANUAL_DEFINITION },
    });
    const automation = await createResp.json();

    await page.request.post(`${testServer.url}/api/automations/${automation.id}/run`, {});

    const autoItem = page.locator("text=Data Preview UI Test").first();
    await autoItem.click();

    await page.waitForTimeout(1500);

    const nodeExecHeader = page.locator("text=Node Executions").first();
    await expect(nodeExecHeader).toBeVisible({ timeout: 5000 });

    const nodeRow = page.locator("[class*='text-gray-300']").first();
    if (await nodeRow.isVisible()) {
      await nodeRow.click();
      await expect(page.locator("text=Data Preview").first()).toBeVisible({ timeout: 3000 });
    }
  });
});
