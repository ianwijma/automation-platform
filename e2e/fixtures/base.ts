import { test as base, expect } from "@playwright/test";
import type { TestServerResult } from "./test-server.js";

type E2EFixtures = {
  testServer: TestServerResult;
};

export const test = base.extend<E2EFixtures>({
  testServer: async ({}, use) => {
    const { startTestServer } = await import("./test-server.js");
    const server = await startTestServer();
    await use(server);
    await server.close();
  },
});

export { expect };

export async function waitForRun(
  request: import("@playwright/test").APIRequestContext,
  url: string,
  id: string,
): Promise<any> {
  let run: any;
  await expect
    .poll(async () => {
      const response = await request.get(`${url}/api/runs/${id}`);
      expect(response.ok()).toBeTruthy();
      run = await response.json();
      return run.status;
    })
    .not.toMatch(/^(queued|running)$/);
  return run;
}
