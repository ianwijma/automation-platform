import { resolve } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import type { AutomationDefinition } from "../src/core/types.js";
const image = process.argv[2] ?? "automation-platform:implementation-test";
const name = `ap-smoke-${randomUUID()}`;
const token = randomBytes(32).toString("hex");
async function docker(args: string[]) {
  const child = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, out, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code) throw new Error(`Docker failed: ${error}`);
  return out.trim();
}
try {
  await docker([
    "run",
    "--detach",
    "--name",
    name,
    "--publish",
    "127.0.0.1::7480",
    "--env",
    `AP_ADMIN_TOKEN=${token}`,
    "--env",
    "AP_PUBLIC_URL=https://localhost",
    "--volume",
    `${resolve("scripts/fixtures")}:/fixtures:ro`,
    image,
  ]);
  const port = (await docker(["port", name, "7480/tcp"])).split(":").at(-1),
    url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + "/api/system/info")).ok) break;
    } catch {}
    await Bun.sleep(100);
  }
  if ((await fetch(url + "/api/automations")).status !== 401)
    throw new Error("Authentication missing");
  const api = async (path: string, body?: unknown): Promise<any> => {
    const r = await fetch(url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data));
    return data;
  };
  if (!(await (await fetch(url)).text()).includes("<script"))
    throw new Error("Embedded UI missing");
  async function execute(
    type: string,
    params: Record<string, unknown>,
    triggerData?: import("../src/core/node-contract.js").NodeItem[],
  ) {
    const definition: AutomationDefinition = {
      schemaVersion: 1,
      name: "Container smoke",
      settings: {
        runTimeoutSec: 30,
        savePayloads: true,
        errorAutomationId: null,
      },
      nodes: [
        {
          id: "start",
          name: "Start",
          type: "trigger.manual",
          typeVersion: 1,
          params: {},
          target: { kind: "local" },
          disabled: false,
          position: { x: 0, y: 0 },
        },
        {
          id: "test",
          name: "Test",
          type,
          typeVersion: 1,
          params,
          target: { kind: "local" },
          disabled: false,
          position: { x: 100, y: 0 },
        },
      ],
      edges: [
        {
          id: "edge",
          source: "start",
          sourcePort: "out",
          target: "test",
          targetPort: "in",
        },
      ],
    };
    const auto = await api("/api/automations", {
      name: definition.name,
      definition,
    });
    const accepted = await api(`/api/automations/${auto.id}/run`, {
      triggerData,
    });
    for (let i = 0; i < 800; i++) {
      const run = await api(`/api/runs/${accepted.id}`);
      if (!["queued", "running"].includes(run.status)) {
        if (run.status !== "success") throw new Error(JSON.stringify(run));
        return run;
      }
      await Bun.sleep(50);
    }
    throw new Error(`Run deadline: ${type}`);
  }
  const command = await execute("system.command", { command: "id -u" });
  if (command.nodeExecutions.at(-1).output[0].json.stdout.trim() !== "10001")
    throw new Error("Container must run unprivileged");
  const ocr = await execute("vision.ocr", {
    imagePath: "/fixtures/ocr.png",
    engine: "wasm",
  });
  if (
    !ocr.nodeExecutions.at(-1).output[0].json.text.includes("AUTOMATION 12345")
  )
    throw new Error("Offline OCR mismatch");
  await docker([
    "exec",
    name,
    "convert",
    "/fixtures/match.ppm",
    "-crop",
    "15x13+23+19",
    "+repage",
    "/tmp/template.png",
  ]);
  const bytes = await Bun.file("scripts/fixtures/match.ppm").arrayBuffer();
  const upload = await fetch(
    url + `/api/artifacts/fixture.ppm?runId=${ocr.id}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/x-portable-pixmap",
      },
      body: bytes,
    },
  );
  if (!upload.ok) throw new Error(await upload.text());
  const artifact = (await upload.json()) as { id: string; size: number };
  const matched = await execute(
    "vision.image.detect",
    { template: "/tmp/template.png", confidence: 0.99 },
    [
      {
        json: {},
        binary: {
          image: {
            $artifact: artifact.id,
            mime: "image/x-portable-pixmap",
            size: artifact.size,
            name: "fixture.ppm",
          },
        },
      },
    ],
  );
  const match = matched.nodeExecutions.at(-1).output[0].json;
  if (!match.found || match.location.x !== 23 || match.location.y !== 19)
    throw new Error(JSON.stringify(match));
  console.log(
    "Container passed: authenticated API, embedded UI, non-root command execution, offline OCR, image matching.",
  );
} finally {
  await docker(["rm", "--force", "--volumes", name]).catch(() => {});
}
