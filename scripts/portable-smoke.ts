import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
const binary = resolve(process.argv[2] ?? "dist/ap");
const dir = mkdtempSync("/tmp/ap-portable-smoke-");
const env = {
  ...process.env,
  AP_DATA_DIR: join(dir, "profile"),
  AP_HOST: "127.0.0.1",
  AP_PORT: "0",
  AP_PUBLIC_URL: "",
  AP_ADMIN_TOKEN: "",
  AP_UI_DIST: "",
  AP_OCR_RUNTIME: "",
  AP_DESKTOP_BRIDGE: "",
};
for (const key of [
  "AP_UI_DIST",
  "AP_OCR_RUNTIME",
  "AP_DESKTOP_BRIDGE",
  "AP_ADMIN_TOKEN",
  "AP_PUBLIC_URL",
])
  delete env[key as keyof typeof env];
const child = Bun.spawn([binary, "serve", "--port", "0", "--no-browser"], {
  cwd: dir,
  env,
  stdout: "pipe",
  stderr: "inherit",
});
const stopTimer = setTimeout(() => child.kill("SIGKILL"), 30000);
try {
  let output = "",
    url = "";
  for await (const chunk of child.stdout) {
    output += new TextDecoder().decode(chunk);
    url = output.match(/AP_READY (http[^\s]+)/)?.[1] ?? "";
    if (url) break;
  }
  if (!url) throw new Error("No ready URL");
  const page = await fetch(url);
  const html = await page.text();
  if (page.status !== 200 || !html.includes("<script"))
    throw new Error("Embedded UI missing");
  const js = html.match(/src="([^\"]+\.js)"/)?.[1];
  if (!js || !(await fetch(url + js)).ok)
    throw new Error("Embedded JS missing");
  const definition = {
    schemaVersion: 1,
    name: "Portable runtime",
    settings: {
      runTimeoutSec: 10,
      savePayloads: true,
      errorAutomationId: null,
    },
    nodes: [
      {
        id: "start",
        type: "trigger.manual",
        typeVersion: 1,
        name: "Start",
        target: { kind: "local" },
        params: { testData: { n: 2 } },
        disabled: false,
        position: { x: 0, y: 0 },
      },
      {
        id: "code",
        type: "logic.code",
        typeVersion: 1,
        name: "Sandbox",
        target: { kind: "local" },
        params: {
          code: "return [{json:{value:ctx.$json.n+1,host:typeof process}}]",
        },
        disabled: false,
        position: { x: 200, y: 0 },
      },
    ],
    edges: [
      {
        id: "e",
        source: "start",
        sourcePort: "out",
        target: "code",
        targetPort: "in",
      },
    ],
  };
  const api = async (path: string, body?: unknown): Promise<any> => {
    const response = await fetch(url + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
  };
  async function execute(definition: unknown) {
    const auto = await api("/api/automations", {
      name: "Portable",
      definition,
    });
    const run = await api(`/api/automations/${auto.id}/run`, {});
    for (let i = 0; i < 200; i++) {
      const r = await api(`/api/runs/${run.id}`);
      if (r.status !== "running" && r.status !== "queued") {
        if (r.status !== "success") throw new Error(JSON.stringify(r));
        return r;
      }
      await Bun.sleep(25);
    }
    throw new Error("Run timeout");
  }
  const run = await execute(definition);
  const result = run.nodeExecutions.at(-1).output[0].json;
  if (result.value !== 3 || result.host !== "undefined")
    throw new Error("Compiled sandbox did not work");
  const image = process.argv[3];
  if (image) {
    const path = join(dir, "ocr.png");
    copyFileSync(resolve(image), path);
    definition.nodes[1] = {
      ...definition.nodes[1],
      type: "vision.ocr",
      params: { imagePath: path, engine: "wasm" },
    } as any;
    const ocr = await execute(definition);
    if (
      !ocr.nodeExecutions
        .at(-1)
        .output[0].json.text.includes("AUTOMATION 12345")
    )
      throw new Error("Compiled OCR mismatch");
  }
  console.log(
    `Portable executable passed from an empty directory: embedded UI, API, SQLite, QuickJS${image ? ", offline OCR" : ""}.`,
  );
} finally {
  child.kill("SIGTERM");
  await child.exited;
  clearTimeout(stopTimer);
  rmSync(dir, { recursive: true, force: true });
}
