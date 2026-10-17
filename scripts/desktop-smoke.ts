import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ExecutionEngine } from "../src/core/execution-engine.js";
import { AgentDispatcher } from "../src/agent/dispatcher.js";
import { createDatabase } from "../src/db/database.js";
import { createAutomation } from "../src/api/automations.js";
import { ArtifactStore } from "../src/api/artifacts.js";
import type {
  AutomationDefinition,
  AutomationNode,
} from "../src/core/types.js";
import "../src/nodes/index.js";
const dir = mkdtempSync("/tmp/ap-x11-smoke-");
const children: ReturnType<typeof Bun.spawn>[] = [];
async function line(proc: ReturnType<typeof Bun.spawn>): Promise<string> {
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  try {
    const { value } = await reader.read();
    return new TextDecoder().decode(value);
  } finally {
    reader.releaseLock();
  }
}
try {
  const build = Bun.spawn(
    [
      "cc",
      "scripts/fixtures/x11-window.c",
      "-lX11",
      "-o",
      join(dir, "fixture"),
    ],
    { stderr: "inherit" },
  );
  if (await build.exited) throw new Error("X11 fixture compile failed");
  const display = Bun.spawn(
    [
      "Xvfb",
      "-displayfd",
      "1",
      "-screen",
      "0",
      "800x600x24",
      "-nolisten",
      "tcp",
    ],
    { stdout: "pipe", stderr: "inherit" },
  );
  children.push(display);
  process.env.DISPLAY = `:${(await line(display)).trim()}`;
  process.env.XDG_SESSION_TYPE = "x11";
  delete process.env.WAYLAND_DISPLAY;
  const window = Bun.spawn([join(dir, "fixture"), join(dir, "events")], {
    stdout: "pipe",
    stderr: "inherit",
    env: process.env,
  });
  children.push(window);
  if (!(await line(window)).startsWith("READY"))
    throw new Error("Fixture did not start");
  const node = (
    id: string,
    type: string,
    params = {},
    targetWindow = false,
  ): AutomationNode => ({
    id,
    type,
    name: id,
    typeVersion: 1,
    params,
    target: { kind: "local" },
    disabled: false,
    position: { x: 0, y: 0 },
    actionTarget: targetWindow
      ? { kind: "window", windowTitle: "^AP Fixture$" }
      : undefined,
  });
  const nodes = [
    node("start", "trigger.manual"),
    node("windows", "vision.window.list"),
    node("screenshot", "vision.screenshot", {}, true),
    node("ocr", "vision.ocr", { engine: "wasm" }),
    node("type", "input.keyboard.type", { text: "ap typed", delay: 0 }, true),
    node(
      "click",
      "input.mouse.click",
      { x: 100, y: 120, button: "left", clickCount: 1 },
      true,
    ),
  ];
  const definition: AutomationDefinition = {
    schemaVersion: 1,
    name: "Owned X11 fixture",
    nodes,
    edges: nodes
      .slice(1)
      .map((n, i) => ({
        id: String(i),
        source: nodes[i].id,
        sourcePort: "out",
        target: n.id,
        targetPort: "in",
      })),
    settings: {
      runTimeoutSec: 20,
      savePayloads: true,
      errorAutomationId: null,
    },
  };
  const db = createDatabase(join(dir, "ap.db")),
    artifacts = new ArtifactStore(dir, db.db),
    dispatcher = new AgentDispatcher(undefined, undefined, artifacts);
  dispatcher.attachDatabase(db.db);
  try {
    const auto = createAutomation(db.db, definition.name, definition);
    const run = await new ExecutionEngine(dispatcher).execute(
      definition,
      auto.id,
      "draft",
      { mode: "manual" },
    );
    if (run.status !== "success") throw new Error(JSON.stringify(run));
    const text = String(
      run.nodeExecutions.find((n) => n.nodeId === "ocr")?.output?.[0].json.text,
    );
    if (!text.includes("AUTOMATION 12345"))
      throw new Error(`OCR mismatch: ${text}`);
    const events = readFileSync(join(dir, "events"), "utf8");
    if (!events.includes("ap typed") || !events.includes("CLICK:1:100:120"))
      throw new Error(`Input mismatch: ${events}`);
    console.log(
      "X11 passed: title/PID discovery, focus, window capture artifact, offline OCR, typing, coordinate click.",
    );
  } finally {
    await dispatcher.shutdown();
    db.close();
  }
} finally {
  for (const child of children.reverse()) {
    child.kill("SIGTERM");
    await child.exited;
  }
  rmSync(dir, { recursive: true, force: true });
}
