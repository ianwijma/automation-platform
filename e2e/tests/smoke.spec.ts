import { test, expect } from "../fixtures/base.js";

test.describe("Smoke", () => {
  test("system info API works", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/system/info`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.version).toBe("0.1.0");
    expect(body).toHaveProperty("mode");
    expect(body).toHaveProperty("uptime");
  });

  test("automations API returns empty list", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/automations`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toEqual([]);
  });

  test("settings API returns defaults", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/settings`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toHaveProperty("aiModel");
  });
});
