import { test, expect } from "../fixtures/base.js";
import { SIMPLE_MANUAL_COMMAND } from "../fixtures/test-data.js";

test.describe("Automations", () => {
  test("creates a new automation via API", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Test Auto", definition: SIMPLE_MANUAL_COMMAND },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body.name).toBe("Test Auto");
    expect(body.id).toBeDefined();
    expect(body.draft).toBeDefined();
  });

  test("lists automations", async ({ request, testServer }) => {
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Auto A", definition: SIMPLE_MANUAL_COMMAND },
    });
    await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Auto B", definition: SIMPLE_MANUAL_COMMAND },
    });

    const resp = await request.get(`${testServer.url}/api/automations`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.length).toBeGreaterThanOrEqual(2);
    const names = body.map((a: { name: string }) => a.name);
    expect(names).toContain("Auto A");
    expect(names).toContain("Auto B");
  });

  test("gets a single automation", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Single Auto", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    const resp = await request.get(`${testServer.url}/api/automations/${id}`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.id).toBe(id);
    expect(body.name).toBe("Single Auto");
  });

  test("gets 404 for missing automation", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/automations/nonexistent-id`);
    expect(resp.status()).toBe(404);
  });

  test("updates an automation", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Original", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    const updatedDef = { ...SIMPLE_MANUAL_COMMAND, name: "Updated" };
    const resp = await request.put(`${testServer.url}/api/automations/${id}`, {
      data: { definition: updatedDef },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.draft.name).toBe("Updated");
  });

  test("deletes an automation", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "ToDelete", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    const delResp = await request.delete(`${testServer.url}/api/automations/${id}`);
    expect(delResp.ok()).toBeTruthy();
    expect(await delResp.json()).toEqual({ success: true });

    const getResp = await request.get(`${testServer.url}/api/automations/${id}`);
    expect(getResp.status()).toBe(404);
  });

  test("activates and deactivates an automation", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Toggle", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    const activateResp = await request.post(`${testServer.url}/api/automations/${id}/activate`);
    expect(activateResp.ok()).toBeTruthy();
    const activated = await activateResp.json();
    expect(activated.activeVersionId).toBeDefined();
    expect(activated.activeVersionId).not.toBeNull();

    const deactivateResp = await request.post(`${testServer.url}/api/automations/${id}/deactivate`);
    expect(deactivateResp.ok()).toBeTruthy();
    const deactivated = await deactivateResp.json();
    expect(deactivated.activeVersionId).toBeNull();
  });

  test("creates automation via UI and sees it in sidebar", async ({ page, testServer }) => {
    await page.goto(testServer.url);
    await page.waitForSelector("text=Automations");

    await page.click('button:has-text("New")');
    await page.fill('input[placeholder="Automation name"]', "UI Created");
    await page.click('button:has-text("Create")');

    await page.waitForSelector('text="UI Created"');
    expect(await page.textContent("body")).toContain("UI Created");
  });

  test("delete automation via UI with confirmation", async ({ page, testServer, request }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "UIDelete", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    await page.goto(testServer.url);
    await page.waitForSelector('text="UIDelete"');

    page.on("dialog", (dialog) => dialog.accept());
    const row = page.locator('div.group:has-text("UIDelete")').first();
    await row.hover();
    const deleteBtn = row.locator('button svg.lucide-trash-2').first();
    await deleteBtn.click();

    await page.waitForSelector('text="No automations yet"', { timeout: 5000 }).catch(() => {});

    const verifyResp = await request.get(`${testServer.url}/api/automations/${id}`);
    expect(verifyResp.status()).toBe(404);
  });

  test("activate toggle in sidebar", async ({ page, testServer, request }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "UIToggle", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    await page.goto(testServer.url);
    await page.waitForSelector('text="UIToggle"');

    page.on("dialog", (dialog) => dialog.accept());
    const row = page.locator('div.group:has-text("UIToggle")').first();
    const zapBtn = row.locator('button svg.lucide-zap-off, button svg.lucide-zap').first();
    await zapBtn.click();

    await page.waitForTimeout(500);

    const checkResp = await request.get(`${testServer.url}/api/automations/${id}`);
    const auto = await checkResp.json();
    expect(auto.activeVersionId).not.toBeNull();
  });
});
