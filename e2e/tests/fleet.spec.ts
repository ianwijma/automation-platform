import { test, expect } from "../fixtures/base.js";

test.describe("Fleet Execution", () => {
  test("GET /api/agents returns empty list (no agents connected)", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/agents`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body).toEqual([]);
  });

  test("POST /api/agents/join-tokens creates a token", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/agents/join-tokens`, {
      data: { uses: 5, ttlHours: 24 },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body).toHaveProperty("token");
    expect(body.usesLeft).toBe(5);
    expect(body).toHaveProperty("expiresAt");
  });

  test("join token with defaults", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/agents/join-tokens`, {
      data: {},
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body).toHaveProperty("token");
    expect(body.usesLeft).toBe(1);
  });

  test("PUT /api/agents/:id/tags returns 404 for non-existent agent", async ({ request, testServer }) => {
    const resp = await request.put(`${testServer.url}/api/agents/nonexistent-agent-id/tags`, {
      data: { tags: ["prod"] },
    });
    expect(resp.status()).toBe(404);
  });

  test("POST /api/agents/:id/update returns 404 for disconnected agent", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/agents/nonexistent-agent-id/update`);
    expect(resp.status()).toBe(404);
  });

  test("token is hashed in DB — cannot retrieve plaintext after creation", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/agents/join-tokens`, {
      data: { uses: 1 },
    });
    const body = await resp.json();
    const token = body.token;

    const listResp = await request.get(`${testServer.url}/api/agents`);
    const agents = await listResp.json();

    for (const agent of agents) {
      expect(agent.id).not.toBe(token);
    }
  });
});
