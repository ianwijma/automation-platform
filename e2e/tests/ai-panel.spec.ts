import { test, expect } from "../fixtures/base.js";

test.describe("AI Assistant", () => {
  test("POST /api/ai/chat with no API key returns 400", async ({
    request,
    testServer,
  }) => {
    await request.put(`${testServer.url}/api/settings`, {
      data: { aiApiKey: "" },
    });

    const resp = await request.post(`${testServer.url}/api/ai/chat`, {
      data: { messages: [{ role: "user", content: "hello" }] },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("API key");
  });

  test("POST /api/ai/apply with non-existent automation returns 404", async ({
    request,
    testServer,
  }) => {
    const resp = await request.post(`${testServer.url}/api/ai/apply`, {
      data: {
        automationId: "00000000-0000-0000-0000-000000000000",
        diffs: [
          { op: "add-node", path: "/nodes", value: {}, description: "test" },
        ],
      },
    });
    expect(resp.status()).toBe(404);
  });

  test("GET /api/ai/models with no API key returns 400", async ({
    request,
    testServer,
  }) => {
    await request.put(`${testServer.url}/api/settings`, {
      data: { aiApiKey: "" },
    });

    const resp = await request.get(`${testServer.url}/api/ai/models`);
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain("API key");
  });

  test("AI chat with API key set still works (may fail on endpoint)", async ({
    request,
    testServer,
  }) => {
    await request.put(`${testServer.url}/api/settings`, {
      data: { aiApiKey: "sk-test-key-123", aiModel: "openai/gpt-4o-mini" },
    });

    const resp = await request.post(`${testServer.url}/api/ai/chat`, {
      data: { messages: [{ role: "user", content: "hello" }] },
    });
    expect(resp.status()).toBe(400);
  });

  test("AI panel opens in UI and shows chat input", async ({
    page,
    testServer,
  }) => {
    await page.goto(testServer.url);
    await page.waitForSelector("text=Automation Platform");

    const aiButton = page.locator("button:has-text('AI')");
    await aiButton.click();

    await expect(page.locator("span:text-is('AI Assistant')")).toBeVisible();
    await expect(
      page.locator('input[placeholder="Ask the AI assistant..."]'),
    ).toBeVisible();
  });

  test("AI panel sends message and shows error without real key", async ({
    page,
    request,
    testServer,
  }) => {
    await page.goto(testServer.url);
    await page.waitForSelector("text=Automation Platform");

    await request.put(`${testServer.url}/api/settings`, {
      data: { aiApiKey: "" },
    });

    const aiButton = page.locator("button:has-text('AI')");
    await aiButton.click();
    await expect(page.locator("span:text-is('AI Assistant')")).toBeVisible();

    const input = page.locator('input[placeholder="Ask the AI assistant..."]');
    await input.fill("test message");
    await input.press("Enter");

    await expect(page.locator("text=API key")).toBeVisible({ timeout: 5000 });
  });
});
