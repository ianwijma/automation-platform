import { test, expect } from "../fixtures/base.js";

test.describe("Settings", () => {
  test("GET /api/settings returns defaults", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/settings`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toHaveProperty("aiModel");
    expect(body).toHaveProperty("hasApiKey");
    expect(body).toHaveProperty("aiEndpoint");
  });

  test("PUT /api/settings updates model", async ({ request, testServer }) => {
    const resp = await request.put(`${testServer.url}/api/settings`, {
      data: { aiModel: "openai/gpt-4o" },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.aiModel).toBe("openai/gpt-4o");
  });

  test("PUT /api/settings updates endpoint", async ({ request, testServer }) => {
    const resp = await request.put(`${testServer.url}/api/settings`, {
      data: { aiEndpoint: "https://custom.api.com/v1" },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.aiEndpoint).toBe("https://custom.api.com/v1");
  });

  test("API key masking works for short keys", async ({ request, testServer }) => {
    await request.put(`${testServer.url}/api/settings`, {
      data: { aiApiKey: "short" },
    });

    const resp = await request.get(`${testServer.url}/api/settings`);
    const body = await resp.json();
    expect(body.aiApiKey).toBe("****");
    expect(body.hasApiKey).toBe(true);
  });

  test("API key masking works for long keys", async ({ request, testServer }) => {
    await request.put(`${testServer.url}/api/settings`, {
      data: { aiApiKey: "sk-very-long-api-key-value-here" },
    });

    const resp = await request.get(`${testServer.url}/api/settings`);
    const body = await resp.json();
    expect(body.aiApiKey).toContain("****");
    expect(body.aiApiKey).not.toBe("sk-very-long-api-key-value-here");
    expect(body.hasApiKey).toBe(true);
  });

  test("masked key in update preserves original key", async ({ request, testServer }) => {
    await request.put(`${testServer.url}/api/settings`, {
      data: { aiApiKey: "original-secret-key" },
    });

    await request.put(`${testServer.url}/api/settings`, {
      data: { aiModel: "openai/gpt-4o", aiApiKey: "****" },
    });

    const resp = await request.get(`${testServer.url}/api/settings`);
    const body = await resp.json();
    expect(body.hasApiKey).toBe(true);
  });

  test("settings survive multiple updates without data loss", async ({ request, testServer }) => {
    await request.put(`${testServer.url}/api/settings`, {
      data: { aiModel: "persist-test-model" },
    });

    const getResp = await request.get(`${testServer.url}/api/settings`);
    const body = await getResp.json();
    expect(body.aiModel).toBe("persist-test-model");

    await request.put(`${testServer.url}/api/settings`, {
      data: { aiEndpoint: "https://persist-endpoint.com" },
    });

    const getResp2 = await request.get(`${testServer.url}/api/settings`);
    const body2 = await getResp2.json();
    expect(body2.aiModel).toBe("persist-test-model");
    expect(body2.aiEndpoint).toBe("https://persist-endpoint.com");
  });

  test("in UI: settings panel opens and shows current settings", async ({ page, testServer }) => {
    await page.goto(testServer.url);
    await page.waitForSelector('text="Settings"');

    await page.click('button:has-text("Settings")');
    await page.waitForSelector('text="AI Provider"', { timeout: 5000 });

    expect(await page.textContent("body")).toContain("API Key");
    expect(await page.textContent("body")).toContain("Model");
    expect(await page.textContent("body")).toContain("Endpoint");
  });

  test("in UI: can update settings", async ({ page, testServer }) => {
    await page.goto(testServer.url);
    await page.waitForSelector('text="Settings"');

    await page.click('button:has-text("Settings")');
    await page.waitForSelector('text="AI Provider"', { timeout: 5000 });

    const modelInput = page.locator('input[placeholder="e.g. gpt-4o"]');
    await modelInput.fill("test-model-ui");
    await page.click('button:has-text("Save Settings")');

    await page.waitForTimeout(500);

    const resp = await page.evaluate(async (url: string) => {
      const r = await fetch(`${url}/api/settings`);
      return r.json();
    }, testServer.url);
    expect(resp.aiModel).toBe("test-model-ui");
  });
});
