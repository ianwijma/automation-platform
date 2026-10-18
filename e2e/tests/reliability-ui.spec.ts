import { test, expect } from "../fixtures/base.js";
import { startTestServer } from "../fixtures/test-server.js";
import type { AutomationDefinition } from "../../src/core/types.js";
const definition: AutomationDefinition = {
  schemaVersion: 1,
  name: "Reliable editor",
  settings: { runTimeoutSec: 30, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "start",
      name: "Start",
      type: "trigger.manual",
      typeVersion: 1,
      target: { kind: "local" },
      params: { testData: { value: 1 } },
      position: { x: 0, y: 0 },
      disabled: false,
    },
  ],
  edges: [],
};

test("invalid JSON cannot save or run and a corrected value persists", async ({
  page,
  request,
  testServer,
}) => {
  const response = await request.post(testServer.url + "/api/automations", {
    data: { name: definition.name, definition },
  });
  const auto = await response.json();
  await page.goto(testServer.url);
  await page.getByText(definition.name, { exact: true }).click();
  await page.locator('.react-flow__node[data-id="start"]').click();
  await page.getByLabel("testData", { exact: true }).fill('{"value":');
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(
    page.getByText(
      "Correct invalid parameter values before saving or running.",
    ),
  ).toBeVisible();
  expect(
    await (
      await request.get(`${testServer.url}/api/runs?automationId=${auto.id}`)
    ).json(),
  ).toHaveLength(0);
  await page.getByLabel("testData", { exact: true }).fill('{"value":42}');
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${testServer.url}/api/automations/${auto.id}`)
          ).json()
        ).draft.nodes[0].params.testData.value,
    )
    .toBe(42);
});

test("settings create write-only credentials and secret environment variables", async ({
  page,
  request,
  testServer,
}) => {
  await page.goto(testServer.url);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Service key");
  await page
    .getByLabel("Replacement fields (JSON object)")
    .fill('{"apiKey":"private-ui-test"}');
  await page
    .getByRole("button", { name: "Create credential", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  const credentials = await (
    await request.get(testServer.url + "/api/credentials")
  ).json();
  expect(credentials[0].name).toBe("Service key");
  expect(JSON.stringify(credentials)).not.toContain("private-ui-test");
  await expect(
    page.getByLabel("Replacement fields (JSON object)"),
  ).not.toContainText("private-ui-test");
  await page.getByLabel("Variable name").fill("SERVICE_SECRET");
  await page.getByLabel("Secret", { exact: true }).check();
  await page.getByLabel("Value", { exact: true }).fill("private-env-test");
  await page
    .getByRole("button", { name: "Save variable", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete variable SERVICE_SECRET" }),
  ).toBeVisible();
  const env = await (await request.get(testServer.url + "/api/env")).json();
  expect(env[0].isSecret).toBe(true);
  expect(JSON.stringify(env)).not.toContain("private-env-test");
});

test("a running automation is visible and cancellable in the editor", async ({
  page,
  request,
  testServer,
}) => {
  const slow = structuredClone(definition);
  slow.nodes.push({
    ...slow.nodes[0],
    id: "wait",
    name: "Wait",
    type: "logic.delay",
    params: { seconds: 20 },
    position: { x: 220, y: 0 },
  });
  slow.edges.push({
    id: "edge",
    source: "start",
    sourcePort: "out",
    target: "wait",
    targetPort: "in",
  });
  const auto = await (
    await request.post(testServer.url + "/api/automations", {
      data: { name: slow.name, definition: slow },
    })
  ).json();
  await page.goto(testServer.url);
  await page.getByText(slow.name, { exact: true }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(
              `${testServer.url}/api/runs?automationId=${auto.id}`,
            )
          ).json()
        )[0]?.status,
    )
    .toBe("cancelled");
  await expect(
    page.getByText("Status: cancelled", { exact: true }),
  ).toBeVisible();
});

test("authenticated browser session survives reload without exposing the token", async ({
  page,
}) => {
  const token = "isolated-e2e-admin-token-1234567890";
  const server = await startTestServer({ adminToken: token });
  try {
    await page.goto(server.url);
    await page.getByLabel("Administrator token").fill(token);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(
      page
        .getByRole("banner")
        .getByText("Automation Platform", { exact: true }),
    ).toBeVisible();
    const cookie = (await page.context().cookies()).find(
      (c) => c.name === "ap_session",
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(await page.evaluate(() => document.cookie)).not.toContain(token);
    await page.reload();
    await expect(
      page
        .getByRole("banner")
        .getByText("Automation Platform", { exact: true }),
    ).toBeVisible();
  } finally {
    await server.close();
  }
});

test("AI proposals require approval, save a fresh revision, and reject stale edits", async ({
  page,
  request,
}) => {
  const added = {
    ...definition.nodes[0],
    id: "ai-added",
    type: "state.get",
    name: "Remembered value",
    params: { key: "lastAnswer" },
    position: { x: 220, y: 0 },
  };
  const diffs = [
    {
      op: "add-node",
      path: "nodes",
      value: added,
      description: "Add remembered value",
    },
    {
      op: "add-edge",
      path: "edges",
      value: {
        id: "ai-edge",
        source: "start",
        sourcePort: "out",
        target: "ai-added",
        targetPort: "in",
      },
      description: "Connect remembered value",
    },
  ];
  const server = await startTestServer({
    aiReply: "Controlled proposal\n```json\n" + JSON.stringify(diffs) + "\n```",
  });
  try {
    const auto = await (
      await request.post(server.url + "/api/automations", {
        data: { name: definition.name, definition },
      })
    ).json();
    await page.goto(server.url);
    await page.getByText(definition.name, { exact: true }).click();
    await page.getByRole("button", { name: "AI", exact: true }).click();
    const prompt = page.getByPlaceholder("Ask the AI assistant...");
    await prompt.fill("Add a state reader");
    await prompt.press("Enter");
    await page
      .getByRole("button", {
        name: "Approve Add remembered value",
        exact: true,
      })
      .waitFor();
    expect(
      (
        await (
          await request.get(`${server.url}/api/automations/${auto.id}`)
        ).json()
      ).draft.nodes,
    ).toHaveLength(1);
    await page
      .getByRole("button", {
        name: "Approve Add remembered value",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Reject Add remembered value", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Apply Approved Changes" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Approve Add remembered value",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Approve Connect remembered value",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Apply Approved Changes" }).click();
    await expect(
      page.locator('.react-flow__node[data-id="ai-added"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get(
                `${server.url}/api/automations/${auto.id}/versions`,
              )
            ).json()
          ).length,
      )
      .toBeGreaterThanOrEqual(4);
    await expect(page.getByText(/Draft changed/)).toHaveCount(0);
    await prompt.fill("Another proposal");
    await prompt.press("Enter");
    await expect(
      page.getByText("Controlled proposal", { exact: true }),
    ).toHaveCount(2);
    const current = await (
      await request.get(`${server.url}/api/automations/${auto.id}`)
    ).json();
    current.draft.name = "Changed elsewhere";
    expect(
      (
        await request.put(`${server.url}/api/automations/${auto.id}`, {
          data: { definition: current.draft, baseRevision: current.revision },
        })
      ).ok(),
    ).toBe(true);
    await page
      .getByRole("button", {
        name: "Approve Add remembered value",
        exact: true,
      })
      .last()
      .click();
    await page.getByRole("button", { name: "Apply Approved Changes" }).click();
    await expect(page.getByRole("alert")).toContainText("Draft changed");
    expect(
      (
        await (
          await request.get(`${server.url}/api/automations/${auto.id}`)
        ).json()
      ).draft.name,
    ).toBe("Changed elsewhere");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Load models from saved provider",
        exact: true,
      })
      .click();
    await expect(
      page.locator('#ai-provider-models option[value="fixture"]'),
    ).toHaveCount(1);
  } finally {
    await server.close();
  }
});

test("the documented starter workflow imports through the UI and runs", async ({
  page,
  request,
  testServer,
}) => {
  await page.goto(testServer.url);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Import automation", { exact: true })
    .setInputFiles("examples/first-workflow.json");
  await page
    .getByRole("button", { name: "Import with these bindings", exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  let runId = "";
  await expect
    .poll(async () => {
      const runs = await (
        await request.get(`${testServer.url}/api/runs`)
      ).json();
      runId = runs[0]?.id;
      return runs[0]?.status;
    })
    .toBe("success");
  const run = await (
    await request.get(`${testServer.url}/api/runs/${runId}`)
  ).json();
  expect(run.nodeExecutions.at(-1).output[0].json.state_lastAnswer).toBe(42);
});
