import { test, expect } from "../fixtures/base.js";

const DEFINITION_WITH_CRED = {
  schemaVersion: 1,
  name: "Export Test",
  settings: { runTimeoutSec: 3600, savePayloads: true, errorAutomationId: null },
  nodes: [
    {
      id: "n1",
      type: "trigger.manual",
      typeVersion: 1,
      name: "Start",
      target: { kind: "local" },
      params: {},
      credentials: { type: "httpHeaderAuth", name: "my-api-key" },
      disabled: false,
      position: { x: 0, y: 0 },
    },
    {
      id: "n2",
      type: "system.command",
      typeVersion: 1,
      name: "Task",
      target: { kind: "local" },
      params: { command: "echo done" },
      disabled: false,
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ id: "e1", source: "n1", sourcePort: "out", target: "n2", targetPort: "in" }],
};

test.describe("Export/Import", () => {
  test("export returns definition without secret values", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Export Test", definition: DEFINITION_WITH_CRED },
    });
    const automation = await createResp.json();

    const credResp = await request.post(`${testServer.url}/api/credentials`, {
      data: { name: "my-api-key", type: "httpHeaderAuth", values: { headerValue: "super-secret-123" } },
    });
    expect(credResp.status()).toBe(201);

    const envResp = await request.post(`${testServer.url}/api/env`, {
      data: { scope: "automation", scopeId: automation.id, key: "API_URL", value: "https://example.com", isSecret: false },
    });
    expect(envResp.status()).toBe(201);

    const exportResp = await request.get(`${testServer.url}/api/automations/${automation.id}/export`);
    expect(exportResp.ok()).toBeTruthy();
    const exported = await exportResp.json();

    expect(exported).toHaveProperty("automation");
    expect(exported).toHaveProperty("credentials");
    expect(exported).toHaveProperty("envVars");

    expect(exported.automation.name).toBe("Export Test");
    expect(exported.credentials.length).toBeGreaterThan(0);

    for (const envVar of exported.envVars) {
      expect(envVar).not.toHaveProperty("value");
    }
  });

  test("import creates new automation from exported data", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Import Source", definition: DEFINITION_WITH_CRED },
    });
    const source = await createResp.json();

    const exportResp = await request.get(`${testServer.url}/api/automations/${source.id}/export`);
    const exported = await exportResp.json();

    const importResp = await request.post(`${testServer.url}/api/import`, {
      data: {
        automation: exported.automation,
        credentials: { "my-api-key": { type: "httpHeaderAuth", value: "new-secret-456" } },
        envVars: { API_URL: { value: "https://imported.example.com", isSecret: false } },
      },
    });
    expect(importResp.status()).toBe(201);
    const imported = await importResp.json();

    expect(imported).toHaveProperty("id");
    expect(imported.id).not.toBe(source.id);
  });

  test("imported automation has different ID", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "ID Diff Test", definition: DEFINITION_WITH_CRED },
    });
    const source = await createResp.json();

    const exportResp = await request.get(`${testServer.url}/api/automations/${source.id}/export`);
    const exported = await exportResp.json();

    const importResp = await request.post(`${testServer.url}/api/import`, {
      data: {
        automation: exported.automation,
        credentials: {},
        envVars: {},
      },
    });
    const imported = await importResp.json();

    const getResp = await request.get(`${testServer.url}/api/automations/${imported.id}`);
    expect(getResp.ok()).toBeTruthy();

    expect(imported.id).not.toBe(source.id);
  });

  test("credential rebinding works during import", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Rebind Test", definition: DEFINITION_WITH_CRED },
    });
    const source = await createResp.json();

    const exportResp = await request.get(`${testServer.url}/api/automations/${source.id}/export`);
    const exported = await exportResp.json();

    const importResp = await request.post(`${testServer.url}/api/import`, {
      data: {
        automation: exported.automation,
        credentials: { "my-api-key": { type: "httpHeaderAuth", value: "rebound-secret" } },
        envVars: {},
        targetRebinding: { n1: { kind: "tag", value: "production" } },
      },
    });
    expect(importResp.status()).toBe(201);
    const imported = await importResp.json();

    const getResp = await request.get(`${testServer.url}/api/automations/${imported.id}`);
    const importedAuto = await getResp.json();
    const reboundNode = importedAuto.draft.nodes.find((n: any) => n.id === "n1");
    expect(reboundNode.target.kind).toBe("tag");
    expect(reboundNode.target.value).toBe("production");
  });

  test("export of non-existent automation returns 404", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/automations/nonexistent/export`);
    expect(resp.status()).toBe(404);
  });
});
