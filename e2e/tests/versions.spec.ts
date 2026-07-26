import { test, expect } from "../fixtures/base.js";
import { SIMPLE_MANUAL_COMMAND } from "../fixtures/test-data.js";

test.describe("Version History", () => {
  async function createWithUpdates(
    request: any,
    url: string,
    count: number,
  ): Promise<{ id: string; versionIds: string[] }> {
    const createResp = await request.post(`${url}/api/automations`, {
      data: { name: "Versioned Auto", definition: { ...SIMPLE_MANUAL_COMMAND, name: "Versioned Auto" } },
    });
    const { id } = await createResp.json();

    const versionIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const updatedDef = {
        ...SIMPLE_MANUAL_COMMAND,
        name: `Versioned Auto v${i + 2}`,
      };
      const updateResp = await request.put(`${url}/api/automations/${id}`, {
        data: { definition: updatedDef },
      });
      const updated = await updateResp.json();
      versionIds.push(updated.activeVersionId ?? "");
    }

    return { id, versionIds };
  }

  test("create automation and update 3 times produces 4 versions", async ({ request, testServer }) => {
    const { id } = await createWithUpdates(request, testServer.url, 3);

    const resp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    expect(resp.ok()).toBeTruthy();
    const versions = await resp.json();
    expect(versions.length).toBe(4);
  });

  test("GET /api/automations/:id/versions lists all in order", async ({ request, testServer }) => {
    const { id } = await createWithUpdates(request, testServer.url, 3);

    const resp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    const versions = await resp.json();
    const versionNos = versions.map((v: { versionNo: number }) => v.versionNo);
    expect(versionNos).toEqual([4, 3, 2, 1]);
  });

  test("each version has correct definition", async ({ request, testServer }) => {
    const { id } = await createWithUpdates(request, testServer.url, 2);

    const resp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    const versions = await resp.json();
    expect(versions[2].definition.name).toBe("Versioned Auto");
    expect(versions[1].definition.name).toBe("Versioned Auto v2");
    expect(versions[0].definition.name).toBe("Versioned Auto v3");
  });

  test("revert to version 1 creates new version", async ({ request, testServer }) => {
    const { id } = await createWithUpdates(request, testServer.url, 3);

    const revertResp = await request.post(
      `${testServer.url}/api/automations/${id}/revert/1`,
    );
    expect(revertResp.ok()).toBeTruthy();

    const versionsResp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    const versions = await versionsResp.json();
    expect(versions.length).toBe(5);
    expect(versions[0].versionNo).toBe(5);
    expect(versions[0].definition.name).toBe("Versioned Auto");
  });

  test("revert to nonexistent version returns 404", async ({ request, testServer }) => {
    const createResp = await request.post(`${testServer.url}/api/automations`, {
      data: { name: "Revert 404", definition: SIMPLE_MANUAL_COMMAND },
    });
    const { id } = await createResp.json();

    const revertResp = await request.post(
      `${testServer.url}/api/automations/${id}/revert/99`,
    );
    expect(revertResp.status()).toBe(404);
  });

  test("label a version", async ({ request, testServer }) => {
    const { id } = await createWithUpdates(request, testServer.url, 1);

    const versionsResp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    const versions = await versionsResp.json();
    const targetVersion = versions[0];

    const labelResp = await request.put(
      `${testServer.url}/api/automations/${id}/versions/${targetVersion.id}/label`,
      { data: { label: "Stable Release" } },
    );
    expect(labelResp.ok()).toBeTruthy();
    expect(await labelResp.json()).toEqual({ success: true });

    const updatedResp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    const updatedVersions = await updatedResp.json();
    const labeled = updatedVersions.find((v: { id: string }) => v.id === targetVersion.id);
    expect(labeled.label).toBe("Stable Release");
  });

  test("versions for nonexistent automation return 404", async ({ request, testServer }) => {
    const resp = await request.get(`${testServer.url}/api/automations/nonexistent/versions`);
    expect(resp.status()).toBe(404);
  });

  test("version label can be updated", async ({ request, testServer }) => {
    const { id } = await createWithUpdates(request, testServer.url, 1);

    const versionsResp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    const versions = await versionsResp.json();
    const targetVersion = versions[0];

    await request.put(
      `${testServer.url}/api/automations/${id}/versions/${targetVersion.id}/label`,
      { data: { label: "First Label" } },
    );
    await request.put(
      `${testServer.url}/api/automations/${id}/versions/${targetVersion.id}/label`,
      { data: { label: "Updated Label" } },
    );

    const updatedResp = await request.get(`${testServer.url}/api/automations/${id}/versions`);
    const updatedVersions = await updatedResp.json();
    const labeled = updatedVersions.find((v: { id: string }) => v.id === targetVersion.id);
    expect(labeled.label).toBe("Updated Label");
  });
});
