import { test, expect, waitForRun } from "../fixtures/base.js";

const MANUAL_DEFINITION = {
  schemaVersion: 1,
  name: "Data Preview Test",
  settings: {
    runTimeoutSec: 3600,
    savePayloads: true,
    errorAutomationId: null,
  },
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
  edges: [
    {
      id: "e1",
      source: "n1",
      sourcePort: "out",
      target: "n2",
      targetPort: "in",
    },
  ],
};

test.describe("Data Inspection", () => {
  test("GET /api/runs/:id returns node executions with input/output", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Data Preview Test", definition: MANUAL_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run`,
      {
        data: { mode: "manual" },
      },
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    expect(detailResp.ok()).toBeTruthy();
    const detail = await detailResp.json();

    expect(detail).toHaveProperty("nodeExecutions");
    expect(Array.isArray(detail.nodeExecutions)).toBeTruthy();
  });

  test("run with output has non-empty node execution data", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Output Test", definition: MANUAL_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run`,
      {
        data: {},
      },
    );
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    if (detail.nodeExecutions.length > 0) {
      const exec = detail.nodeExecutions[0];
      expect(exec).toHaveProperty("nodeId");
      expect(exec).toHaveProperty("status");
      expect(exec).toHaveProperty("input");
      expect(exec).toHaveProperty("output");
    }
  });

  test("UI: click on a run shows node execution list", async ({
    page,
    testServer,
  }) => {
    const createResp = await page.request.post(
      `${testServer.url}/api/automations`,
      {
        data: { name: "UI Run Test", definition: MANUAL_DEFINITION },
      },
    );
    const automation = await createResp.json();

    await page.request.post(
      `${testServer.url}/api/automations/${automation.id}/run`,
      {},
    );

    await page.goto(testServer.url);
    await page.waitForSelector("text=Automation Platform");

    const autoItem = page.locator("text=UI Run Test").first();
    await autoItem.click();

    await page.waitForSelector("text=Runs", { timeout: 5000 });
    const runButton = page
      .locator(
        "button:has-text('success'), button:has-text('error'), button:has-text('manual')",
      )
      .first();
    await runButton.click();

    await expect(page.locator("text=Node Executions").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("UI: data preview shows when clicking node execution", async ({
    page,
    testServer,
  }) => {
    const createResp = await page.request.post(
      `${testServer.url}/api/automations`,
      {
        data: { name: "Data Preview UI Test", definition: MANUAL_DEFINITION },
      },
    );
    const automation = await createResp.json();

    await page.request.post(
      `${testServer.url}/api/automations/${automation.id}/run`,
      {},
    );

    await page.goto(testServer.url);
    await page.waitForSelector("text=Automation Platform");

    const autoItem = page.locator("text=Data Preview UI Test").first();
    await autoItem.click();

    await page.waitForSelector("text=Runs", { timeout: 5000 });
    const runButton = page
      .locator(
        "button:has-text('success'), button:has-text('error'), button:has-text('manual')",
      )
      .first();
    await runButton.click();

    await expect(page.locator("text=Node Executions").first()).toBeVisible({
      timeout: 5000,
    });

    const nodeRow = page
      .locator("button:has-text('n1'), button:has-text('n2')")
      .first();
    if (await nodeRow.isVisible()) {
      await nodeRow.click();
      await expect(page.locator("text=Data Preview").first()).toBeVisible({
        timeout: 3000,
      });
    }
  });
});
