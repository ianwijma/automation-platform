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
    server.close();
  },
});

export { expect };
