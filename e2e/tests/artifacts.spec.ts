import { test, expect } from "../fixtures/base.js";

test.describe("Artifact Store", () => {
  test("PUT /api/artifacts/:id uploads an artifact", async ({ request, testServer }) => {
    const content = Buffer.from("test artifact content").toString("base64");
    const resp = await request.put(`${testServer.url}/api/artifacts/test-file.txt?runId=run-1`, {
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "text/plain",
      },
      data: content,
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("size");
    expect(body.mime).toBe("text/plain");
    expect(body.name).toBe("test-file.txt");
  });

  test("GET /api/artifacts/:id downloads the same artifact", async ({ request, testServer }) => {
    const content = "downloadable artifact data";
    const putResp = await request.put(`${testServer.url}/api/artifacts/download-test.txt?runId=run-2`, {
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "text/plain",
      },
      data: content,
    });
    const meta = await putResp.json();

    const getResp = await request.get(`${testServer.url}/api/artifacts/${meta.id}`);
    expect(getResp.ok()).toBeTruthy();
    expect(getResp.headers()["content-type"]).toBe("text/plain");
    const body = await getResp.text();
    expect(body).toBe(content);
  });

  test("content-addressed: same content produces same ID", async ({ request, testServer }) => {
    const content = "identical content for hashing test";
    const encoded = Buffer.from(content).toString("base64");

    const put1 = await request.put(`${testServer.url}/api/artifacts/dup-a.txt?runId=run-3`, {
      headers: { Authorization: "Bearer t", "Content-Type": "text/plain" },
      data: encoded,
    });
    const meta1 = await put1.json();

    const put2 = await request.put(`${testServer.url}/api/artifacts/dup-b.txt?runId=run-4`, {
      headers: { Authorization: "Bearer t", "Content-Type": "text/plain" },
      data: encoded,
    });
    const meta2 = await put2.json();

    expect(meta1.id).toBe(meta2.id);
  });

  test("invalid TTL still stores (uses default)", async ({ request, testServer }) => {
    const content = Buffer.from("ttl test").toString("base64");
    const resp = await request.put(`${testServer.url}/api/artifacts/ttl-test.txt?runId=run-5&ttlHours=abc`, {
      headers: { Authorization: "Bearer t", "Content-Type": "text/plain" },
      data: content,
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body).toHaveProperty("id");
  });

  test("upload without auth returns 401", async ({ request, testServer }) => {
    const content = Buffer.from("no auth").toString("base64");
    const resp = await request.put(`${testServer.url}/api/artifacts/no-auth.txt?runId=run-6`, {
      headers: { "Content-Type": "text/plain" },
      data: content,
    });
    expect(resp.status()).toBe(401);
  });

  test("GET non-existent artifact returns 404", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/artifacts/0000000000000000000000000000000000000000000000000000000000000000`);
    expect(resp.status()).toBe(404);
  });
});
