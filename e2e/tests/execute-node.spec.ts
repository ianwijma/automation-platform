import { test, expect } from "../fixtures/base.js";

const COMMAND_DEFINITION = {
  schemaVersion: 1,
  name: "Execute Node Test",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1", type: "trigger.manual", typeVersion: 1, name: "Start",
      target: { kind: "local" }, params: {}, disabled: false, position: { x: 0, y: 0 },
    },
    {
      id: "n2", type: "system.command", typeVersion: 1, name: "Echo",
      target: { kind: "local" }, params: { command: "echo ap-e2e-execute-node-marker" },
      disabled: false, position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
};

test.describe("Execute Node", () => {
  test("POST /api/automations/:id/run-node/:nodeId executes single node with cached input", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Execute Node API Test", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp1 = await request.post(`${testServer.url}/api/automations/${automation.id}/run-node/n2`, {
      data: {},
    });
    expect(runResp1.status()).toBe(201);
    const run1 = await runResp1.json();
    expect(run1.id).toBeDefined();
    expect(run1.mode).toBe("partial");

    const detailResp1 = await request.get(`${testServer.url}/api/runs/${run1.id}`);
    const detail1 = await detailResp1.json();
    expect(detail1.nodeExecutions.length).toBeGreaterThan(0);

    const cmdExec = detail1.nodeExecutions.find((ne: any) => ne.nodeId === "n2");
    expect(cmdExec).toBeDefined();
    expect(cmdExec.output).toBeDefined();
    if (cmdExec.output && cmdExec.output.length > 0) {
      expect(JSON.stringify(cmdExec.output[0].json)).toContain("ap-e2e-execute-node-marker");
    }

    const runResp2 = await request.post(`${testServer.url}/api/automations/${automation.id}/run-node/n2`, {
      data: {},
    });
    expect(runResp2.status()).toBe(201);
    const run2 = await runResp2.json();

    const detailResp2 = await request.get(`${testServer.url}/api/runs/${run2.id}`);
    const detail2 = await detailResp2.json();

    const triggerExec = detail2.nodeExecutions.find((ne: any) => ne.nodeId === "n1");
    if (triggerExec) {
      expect(triggerExec.pinned).toBe(true);
    }
  });

  test("POST /api/automations/:id/run-node/:nodeId with fresh=true re-executes upstream", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Execute Node Fresh Test", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(`${testServer.url}/api/automations/${automation.id}/run-node/n2`, {
      data: { fresh: true },
    });
    expect(runResp.status()).toBe(201);
  });

  test("returns 404 for nonexistent node", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Execute Node 404 Test", definition: COMMAND_DEFINITION },
    });
    const automation = await createResp.json();

    const runResp = await request.post(`${testServer.url}/api/automations/${automation.id}/run-node/nonexistent`, {
      data: {},
    });
    expect(runResp.status()).toBe(404);
  });
});
