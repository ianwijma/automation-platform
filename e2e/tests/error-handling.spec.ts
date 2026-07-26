import { test, expect } from "../fixtures/base.js";

test.describe("Error Scenarios", () => {
  test("GET unknown /api/route returns 404", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/nonexistent-route`);
    expect(resp.status()).toBe(404);
  });

  test("POST /api/automations with invalid JSON returns 400", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/automations`, {
      headers: { "Content-Type": "application/json" },
      data: "this is not json{{{",
    });
    expect(resp.status()).toBe(400);
  });

  test("POST /api/automations/:id/run with empty body works", async ({ request, testServer }) => {
    const definition = {
      schemaVersion: 1,
      name: "Empty Body Run",
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

    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Empty Body Run", definition },
    });
    const automation = await createResp.json();

    const runResp = await request.post(`${testServer.url}/api/automations/${automation.id}/run`, {
      headers: { "Content-Type": "application/json" },
      data: "",
    });
    expect([201, 200]).toContain(runResp.status());
  });

  test("GET /api/automations/nonexistent returns 404", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/automations/00000000-0000-0000-0000-000000000000`);
    expect(resp.status()).toBe(404);
  });

  test("PUT /api/automations/nonexistent returns 404", async ({ request, testServer }) => {
    const definition = {
      schemaVersion: 1,
      name: "Update Nonexistent",
      settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
      nodes: [],
      edges: [],
    };
    const resp = await request.put(`${testServer.url}/api/automations/00000000-0000-0000-0000-000000000000`, {
      data: { definition },
    });
    expect(resp.status()).toBe(404);
  });

  test("DELETE /api/automations/nonexistent returns 404", async ({ request, testServer }) => {
    const resp = await request.delete(`${testServer.url}/api/automations/00000000-0000-0000-0000-000000000000`);
    expect(resp.status()).toBe(404);
  });

  test("GET /api/credentials works (vault is wired)", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/credentials`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test("OPTIONS /api/anything returns 204 (CORS preflight)", async ({ request, testServer }) => {
    const resp = await request.fetch(`${testServer.url}/api/automations`, {
      method: "OPTIONS",
    });
    expect(resp.status()).toBe(204);
  });

  test("CORS headers present on API responses", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/automations`);
    expect(resp.headers()["access-control-allow-origin"]).toBe("*");
    expect(resp.headers()["access-control-allow-methods"]).toBeTruthy();
    expect(resp.headers()["access-control-allow-headers"]).toBeTruthy();
  });

  test("CORS headers present on error responses", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/nonexistent`);
    expect(resp.status()).toBe(404);
    expect(resp.headers()["access-control-allow-origin"]).toBe("*");
  });

  test("POST /api/automations with missing name returns 400", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/automations`, {
      data: { definition: { schemaVersion: 1, name: "test", settings: {}, nodes: [], edges: [] } },
    });
    expect(resp.status()).toBe(400);
  });

  test("POST /api/credentials with missing fields returns 400", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/credentials`, {
      data: { name: "only-name" },
    });
    expect(resp.status()).toBe(400);
  });

  test("GET /api/runs/nonexistent returns 404", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/runs/00000000-0000-0000-0000-000000000000`);
    expect(resp.status()).toBe(404);
  });
});
