import { test, expect, waitForRun } from "../fixtures/base.js";
import { SIMPLE_MANUAL_COMMAND } from "../fixtures/test-data.js";
import type { APIRequestContext } from "@playwright/test";
async function runId(request: APIRequestContext, url: string) {
  const created = await request.post(`${url}/api/automations`, {
    data: { name: "Artifacts", definition: SIMPLE_MANUAL_COMMAND },
  });
  expect(created.status()).toBe(201);
  const automation = await created.json();
  const accepted = await request.post(
    `${url}/api/automations/${automation.id}/run`,
    { data: {} },
  );
  expect(accepted.status()).toBe(202);
  return (await waitForRun(request, url, (await accepted.json()).id)).id;
}
test.describe("Artifact Store", () => {
  test("uploads and downloads bytes with content metadata", async ({
    request,
    testServer,
  }) => {
    const id = await runId(request, testServer.url),
      content = "downloadable artifact data";
    const response = await request.put(
      `${testServer.url}/api/artifacts/test.txt?runId=${id}`,
      { headers: { "Content-Type": "text/plain" }, data: content },
    );
    expect(response.status()).toBe(201);
    const meta = await response.json();
    expect(meta.id).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.size).toBe(Buffer.byteLength(content));
    const downloaded = await request.get(
      `${testServer.url}/api/artifacts/${meta.id}`,
    );
    expect(downloaded.status()).toBe(200);
    expect(downloaded.headers()["content-type"]).toBe("text/plain");
    expect(await downloaded.text()).toBe(content);
    expect(downloaded.headers()["content-security-policy"]).toContain(
      "sandbox",
    );
  });
  test("same content deduplicates across runs", async ({
    request,
    testServer,
  }) => {
    const first = await runId(request, testServer.url),
      second = await runId(request, testServer.url);
    const a = await request.put(
      `${testServer.url}/api/artifacts/a.txt?runId=${first}`,
      { data: "identical content" },
    );
    const b = await request.put(
      `${testServer.url}/api/artifacts/b.txt?runId=${second}`,
      { data: "identical content" },
    );
    expect(a.status()).toBe(201);
    expect(b.status()).toBe(201);
    const left = await a.json(),
      right = await b.json();
    expect(left.id).toBe(right.id);
    expect(
      (
        await request.get(`${testServer.url}/api/artifacts/${left.id}`)
      ).status(),
    ).toBe(200);
  });
  test("invalid retention is rejected", async ({ request, testServer }) => {
    const id = await runId(request, testServer.url);
    for (const ttl of ["abc", "0", "-1", "9000"])
      expect(
        (
          await request.put(
            `${testServer.url}/api/artifacts/a?runId=${id}&ttlHours=${ttl}`,
            { data: "content" },
          )
        ).status(),
      ).toBe(400);
  });
  test("upload must belong to an existing run", async ({
    request,
    testServer,
  }) => {
    expect(
      (
        await request.put(`${testServer.url}/api/artifacts/a?runId=missing`, {
          data: "content",
        })
      ).status(),
    ).toBe(400);
  });
  test("missing and invalid artifact identifiers return 404", async ({
    request,
    testServer,
  }) => {
    for (const id of ["0".repeat(64), "invalid"])
      expect(
        (await request.get(`${testServer.url}/api/artifacts/${id}`)).status(),
      ).toBe(404);
  });
});
