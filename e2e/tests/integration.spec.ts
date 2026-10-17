import { test, expect, waitForRun } from "../fixtures/base.js";

const COMMAND_DEFINITION = {
  schemaVersion: 1,
  name: "Integration Test",
  settings: {
    runTimeoutSec: 3600,
    savePayloads: true,
    errorAutomationId: null,
  },
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
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "Echo",
      target: { kind: "local" },
      params: { command: "echo hello-integration" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      sourcePort: "out",
      target: "n2",
      targetPort: "in",
    },
  ],
};

const MULTI_NODE_DEFINITION = {
  schemaVersion: 1,
  name: "Multi Node Integration",
  settings: {
    runTimeoutSec: 3600,
    savePayloads: true,
    errorAutomationId: null,
  },
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
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "First Command",
      target: { kind: "local" },
      params: { command: "echo first-output" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
    {
      id: "n3",
      type: "system.command",
      typeVersion: 1,
      name: "Second Command",
      target: { kind: "local" },
      params: { command: "echo second-output" },
      disabled: false,
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      sourcePort: "out",
      target: "n2",
      targetPort: "in",
    },
    {
      id: "e2",
      source: "n2",
      sourcePort: "out",
      target: "n3",
      targetPort: "in",
    },
  ],
};

const LAUNCH_DEFINITION = {
  schemaVersion: 1,
  name: "Launch Integration",
  settings: {
    runTimeoutSec: 3600,
    savePayloads: true,
    errorAutomationId: null,
  },
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
    {
      id: "n2",
      type: "system.launch",
      typeVersion: 1,
      name: "Launch Sleep",
      target: { kind: "local" },
      params: { command: "sleep 5", waitForWindowSec: 0 },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      sourcePort: "out",
      target: "n2",
      targetPort: "in",
    },
  ],
};

test.describe("Integration: Execute Node", () => {
  test("execute-node on command returns stdout in output", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration Echo", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n2`,
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    const cmdExec = detail.nodeExecutions.find((ne: any) => ne.nodeId === "n2");
    expect(cmdExec).toBeDefined();
    expect(cmdExec.output).toBeDefined();
    expect(cmdExec.output.length).toBeGreaterThan(0);
    expect(cmdExec.output[0].json.stdout).toContain("hello-integration");
  });

  test("execute-node caches upstream on second run", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration Cache", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n2`,
    );
    const runResp2 = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n2`,
    );
    const run2 = await waitForRun(
      request,
      testServer.url,
      (await runResp2.json()).id,
    );

    const detailResp2 = await request.get(
      `${testServer.url}/api/runs/${run2.id}`,
    );
    const detail2 = await detailResp2.json();

    const triggerExec = detail2.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n1",
    );
    if (triggerExec) {
      expect(triggerExec.pinned).toBe(true);
    }

    const cmdExec = detail2.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n2",
    );
    expect(cmdExec).toBeDefined();
    expect(cmdExec.pinned).toBe(false);
  });

  test("execute-node with inputData seeds trigger output", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration Input Data", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n2`,
      {
        data: {
          inputData: [{ json: { customField: "test-value-123" } }],
        },
      },
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    const triggerExec = detail.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n1",
    );
    if (triggerExec) {
      expect(triggerExec.pinned).toBe(true);
      if (triggerExec.output && triggerExec.output.length > 0) {
        expect(triggerExec.output[0].json.customField).toBe("test-value-123");
      }
    }
  });

  test("execute-node with fresh=true re-executes upstream", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration Fresh", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n2`,
      {
        data: { fresh: true },
      },
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    expect(detail.nodeExecutions.length).toBeGreaterThanOrEqual(2);

    const cmdExec = detail.nodeExecutions.find((ne: any) => ne.nodeId === "n2");
    expect(cmdExec).toBeDefined();
    expect(cmdExec.output[0].json.stdout).toContain("hello-integration");
  });

  test("execute-node on trigger node works", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration Trigger", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n1`,
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    const triggerExec = detail.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n1",
    );
    expect(triggerExec).toBeDefined();
    expect(triggerExec.output).toBeDefined();
    expect(triggerExec.output.length).toBeGreaterThan(0);
  });
});

test.describe("Integration: Full Run", () => {
  test("full automation run produces correct execution chain", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration Full Run", definition: MULTI_NODE_DEFINITION },
    });
    const automation = await createResp.json();
    await request.post(
      `${testServer.url}/api/automations/${automation.id}/activate`,
    );

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run`,
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

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    expect(detail.status).toBe("success");
    expect(detail.nodeExecutions.length).toBe(3);

    const firstCmd = detail.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n2",
    );
    expect(firstCmd.output[0].json.stdout).toContain("first-output");

    const secondCmd = detail.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n3",
    );
    expect(secondCmd.output[0].json.stdout).toContain("second-output");
  });
});

test.describe("Integration: Launch Node", () => {
  test("launch node spawns process and returns pid", async ({
    request,
    testServer,
  }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration Launch", definition: LAUNCH_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n2`,
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    const launchExec = detail.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n2",
    );
    expect(launchExec).toBeDefined();
    expect(launchExec.output).toBeDefined();
    expect(launchExec.output.length).toBeGreaterThan(0);
    expect(launchExec.output[0].json.pid).toBeDefined();
    expect(typeof launchExec.output[0].json.pid).toBe("number");
    expect(launchExec.output[0].json.pid).toBeGreaterThan(0);

    try {
      process.kill(launchExec.output[0].json.pid as number, "SIGKILL");
    } catch {}
  });
});

test.describe("Integration: Window List", () => {
  test("window list node returns windows on X11", async ({
    request,
    testServer,
  }) => {
    const windowListDef = {
      schemaVersion: 1,
      name: "Window List Integration",
      settings: {
        runTimeoutSec: 3600,
        savePayloads: true,
        errorAutomationId: null,
      },
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
        {
          id: "n2",
          type: "vision.window.list",
          typeVersion: 1,
          name: "List Windows",
          target: { kind: "local" },
          params: { filter: "", pid: 0, includeGeometry: true },
          disabled: false,
          position: { x: 200, y: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          sourcePort: "out",
          target: "n2",
          targetPort: "in",
        },
      ],
    };

    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Integration WindowList", definition: windowListDef },
    });
    const automation = await createResp.json();

    const runResp = await request.post(
      `${testServer.url}/api/automations/${automation.id}/run-node/n2`,
    );
    expect(runResp.status()).toBe(202);
    const run = await waitForRun(
      request,
      testServer.url,
      (await runResp.json()).id,
    );

    const detailResp = await request.get(
      `${testServer.url}/api/runs/${run.id}`,
    );
    const detail = await detailResp.json();

    const listExec = detail.nodeExecutions.find(
      (ne: any) => ne.nodeId === "n2",
    );
    expect(listExec).toBeDefined();
    expect(listExec.output.length).toBeGreaterThan(0);
    expect(listExec.output[0].json.windowId).toBeDefined();
    expect(listExec.output[0].json.title).toBeDefined();
  });
});
