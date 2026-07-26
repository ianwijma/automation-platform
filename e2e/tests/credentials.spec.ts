import { test, expect } from "../fixtures/base.js";

test.describe("Credential Management", () => {
  test("POST /api/credentials creates credential", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/credentials`, {
      data: {
        name: "Test SSH Key",
        type: "ssh",
        values: { privateKey: "ssh-rsa AAAA...", user: "deploy" },
      },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("Test SSH Key");
    expect(body.type).toBe("ssh");
    expect(body.values).toEqual({ privateKey: "ssh-rsa AAAA...", user: "deploy" });
  });

  test("GET /api/credentials lists without values", async ({ request, testServer }) => {
    await request.post(`${testServer.url}/api/credentials`, {
      data: {
        name: "List Cred",
        type: "api",
        values: { token: "secret-token-123" },
      },
    });

    const resp = await request.get(`${testServer.url}/api/credentials`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.length).toBeGreaterThanOrEqual(1);

    const listed = body.find((c: { name: string }) => c.name === "List Cred");
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("values");
    expect(listed).toHaveProperty("id");
    expect(listed).toHaveProperty("createdAt");
  });

  test("GET /api/credentials/:id returns with values", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/credentials`, {
      data: {
        name: "Get Cred",
        type: "oauth",
        values: { accessToken: "abc123", refreshToken: "def456" },
      },
    });
    const { id } = await createResp.json();

    const resp = await request.get(`${testServer.url}/api/credentials/${id}`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.values.accessToken).toBe("abc123");
    expect(body.values.refreshToken).toBe("def456");
  });

  test("PUT /api/credentials/:id updates values", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/credentials`, {
      data: {
        name: "Update Cred",
        type: "api",
        values: { token: "old-token" },
      },
    });
    const { id } = await createResp.json();

    const updateResp = await request.put(`${testServer.url}/api/credentials/${id}`, {
      data: { values: { token: "new-token" } },
    });
    expect(updateResp.ok()).toBeTruthy();
    const body = await updateResp.json();
    expect(body.values.token).toBe("new-token");
  });

  test("DELETE /api/credentials/:id deletes", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/credentials`, {
      data: {
        name: "Delete Cred",
        type: "api",
        values: { key: "val" },
      },
    });
    const { id } = await createResp.json();

    const delResp = await request.delete(`${testServer.url}/api/credentials/${id}`);
    expect(delResp.ok()).toBeTruthy();
    expect(await delResp.json()).toEqual({ success: true });

    const getResp = await request.get(`${testServer.url}/api/credentials/${id}`);
    expect(getResp.status()).toBe(404);
  });

  test("GET /api/credentials/:id returns 404 for missing", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/credentials/nonexistent`);
    expect(resp.status()).toBe(404);
  });
});
