import { test, expect } from "../fixtures/base.js";
import { SIMPLE_MANUAL_COMMAND } from "../fixtures/test-data.js";

test.describe("Environment Variables", () => {
  test("POST /api/env sets global var", async ({ request, testServer }) => {
    const resp = await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "GLOBAL_VAR", value: "hello", isSecret: false },
    });
    expect(resp.status()).toBe(201);
    expect(await resp.json()).toEqual({ success: true });
  });

  test("GET /api/env lists vars", async ({ request, testServer }) => {
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "LIST_VAR", value: "visible", isSecret: false },
    });

    const resp = await request.get(`${testServer.url}/api/env`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    const found = body.find((v: { key: string }) => v.key === "LIST_VAR");
    expect(found).toBeDefined();
    expect(found.value).toBe("visible");
  });

  test("GET /api/env filters by scope", async ({ request, testServer }) => {
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "SCOPE_GLOBAL", value: "g", isSecret: false },
    });

    const resp = await request.get(`${testServer.url}/api/env?scope=global`);
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    for (const v of body) {
      expect(v.scope).toBe("global");
    }
  });

  test("POST /api/env sets automation-scoped var", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Env Auto", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    const resp = await request.post(`${testServer.url}/api/env`, {
      data: { scope: "automation", scopeId: id, key: "AUTO_VAR", value: "auto-val", isSecret: false },
    });
    expect(resp.status()).toBe(201);

    const listResp = await request.get(`${testServer.url}/api/env?scope=automation&scopeId=${id}`);
    const body = await listResp.json();
    const found = body.find((v: { key: string }) => v.key === "AUTO_VAR");
    expect(found).toBeDefined();
    expect(found.value).toBe("auto-val");
  });

  test("secret vars do not expose value in list", async ({ request, testServer }) => {
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "SECRET_VAR", value: "secret-val", isSecret: true },
    });

    const resp = await request.get(`${testServer.url}/api/env`);
    const body = await resp.json();
    const found = body.find((v: { key: string }) => v.key === "SECRET_VAR");
    expect(found).toBeDefined();
    expect(found.isSecret).toBe(true);
    expect(found.value).toBeUndefined();
  });

  test("DELETE /api/env deletes var", async ({ request, testServer }) => {
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "DEL_VAR", value: "bye", isSecret: false },
    });

    const delResp = await request.delete(
      `${testServer.url}/api/env?scope=global&key=DEL_VAR`,
    );
    expect(delResp.ok()).toBeTruthy();
    expect(await delResp.json()).toEqual({ success: true });

    const listResp = await request.get(`${testServer.url}/api/env`);
    const body = await listResp.json();
    const found = body.find((v: { key: string }) => v.key === "DEL_VAR");
    expect(found).toBeUndefined();
  });

  test("DELETE /api/env returns 404 for missing key", async ({ request, testServer }) => {
    const delResp = await request.delete(
      `${testServer.url}/api/env?scope=global&key=NONEXISTENT`,
    );
    expect(delResp.status()).toBe(404);
  });

  test("precedence: machine > automation > global", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Precedence Auto", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id: autoId } = await createResp.json();

    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "PREC_VAR", value: "global-val", isSecret: false },
    });
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "automation", scopeId: autoId, key: "PREC_VAR", value: "auto-val", isSecret: false },
    });
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "machine", scopeId: "local", key: "PREC_VAR", value: "machine-val", isSecret: false },
    });

    const resp = await request.get(`${testServer.url}/api/env`);
    const body = await resp.json();
    const precVars = body.filter((v: { key: string }) => v.key === "PREC_VAR");
    expect(precVars.length).toBe(3);

    const machineVar = precVars.find((v: { scope: string }) => v.scope === "machine");
    expect(machineVar?.value).toBe("machine-val");
  });

  test("updates existing var instead of duplicating", async ({ request, testServer }) => {
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "UPD_VAR", value: "v1", isSecret: false },
    });
    await request.post(`${testServer.url}/api/env`, {
      data: { scope: "global", scopeId: null, key: "UPD_VAR", value: "v2", isSecret: false },
    });

    const resp = await request.get(`${testServer.url}/api/env?scope=global`);
    const body = await resp.json();
    const updVars = body.filter((v: { key: string }) => v.key === "UPD_VAR");
    expect(updVars.length).toBe(1);
    expect(updVars[0].value).toBe("v2");
  });
});
