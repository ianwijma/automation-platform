import { test, expect, waitForRun } from "../fixtures/base.js";
import {
  SIMPLE_MANUAL_COMMAND,
  ERROR_PIPELINE,
} from "../fixtures/test-data.js";

async function createAndActivate(
  request: any,
  url: string,
  definition: any = SIMPLE_MANUAL_COMMAND,
  name: string = "Run Test",
): Promise<{ id: string }> {
  const createResp = await request.post(`${url}/api/automations`, {
    data: { name, definition },
  });
  const { id } = await createResp.json();
  await request.post(`${url}/api/automations/${id}/activate`);
  return { id };
}

test.describe("Execution", () => {
  test("run automation returns with status", async ({
    request,
    testServer,
  }) => {
    const { id } = await createAndActivate(request, testServer.url);

    const runResp = await request.post(
      `${testServer.url}/api/automations/${id}/run`,
      {
        data: { mode: "manual" },
      },
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );
    expect(run.id).toBeDefined();
    expect(run.automationId).toBe(id);
    expect(["success", "error", "running"]).toContain(run.status);
    expect(run.startedAt).toBeDefined();
  });

  test("run appears in run history", async ({ request, testServer }) => {
    const { id } = await createAndActivate(request, testServer.url);

    await request.post(`${testServer.url}/api/automations/${id}/run`, {
      data: { mode: "manual" },
    });

    const runsResp = await request.get(
      `${testServer.url}/api/runs?automationId=${id}`,
    );
    expect(runsResp.ok()).toBeTruthy();
    const runs = await runsResp.json();
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0].automationId).toBe(id);
  });

  test("run details include node executions", async ({
    request,
    testServer,
  }) => {
    const { id } = await createAndActivate(request, testServer.url);

    const runResp = await request.post(
      `${testServer.url}/api/automations/${id}/run`,
      {
        data: { mode: "manual" },
      },
    );
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    expect(detailResp.ok()).toBeTruthy();
    const detail = await detailResp.json();
    expect(detail.nodeExecutions).toBeDefined();
    expect(Array.isArray(detail.nodeExecutions)).toBeTruthy();
  });

  test("dry-run mode executes without side effects", async ({
    request,
    testServer,
  }) => {
    const { id } = await createAndActivate(request, testServer.url);

    const runResp = await request.post(
      `${testServer.url}/api/automations/${id}/run`,
      {
        data: { mode: "manual", dryRun: true },
      },
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );
    expect(run.mode).toBe("manual");
    expect(
      run.nodeExecutions.some((ne: { simulated: boolean }) => ne.simulated),
    ).toBeTruthy();
  });

  test("error pipeline causes run to fail", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Error Test", definition: ERROR_PIPELINE },
    });
    const { id } = await createResp.json();
    await request.post(`${testServer.url}/api/automations/${id}/activate`);

    const runResp = await request.post(
      `${testServer.url}/api/automations/${id}/run`,
      {
        data: { mode: "manual" },
      },
    );
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();
    expect(detail.status).toBe("error");
    expect(detail.error).toContain("intentional test error");
  });

  test("run without activation uses draft", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Draft Run", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${id}/run`,
      {
        data: { mode: "manual" },
      },
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );
    expect(run.id).toBeDefined();
  });

  test("run for nonexistent automation returns 404", async ({
    request,
    testServer,
  }) => {
    const runResp = await request.post(
      `${testServer.url}/api/automations/nonexistent/run`,
      {
        data: { mode: "manual" },
      },
    );
    expect(runResp.status()).toBe(404);
  });
});
