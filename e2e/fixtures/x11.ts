import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "./base.js";
import { startTestServer } from "./test-server.js";

type DesktopFixture = {
  display: string;
  pid: number;
  windowId: string;
};

async function firstLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    const timer = setTimeout(
      () => finish(new Error(`Desktop fixture startup timed out: ${errors}`)),
      10_000,
    );
    function finish(error?: Error, line?: string) {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onErrorData);
      child.off("error", onError);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve(line!);
    }
    function onData(data: Buffer) {
      output += data.toString();
      const newline = output.indexOf("\n");
      if (newline !== -1) finish(undefined, output.slice(0, newline).trim());
    }
    function onErrorData(data: Buffer) {
      errors += data.toString();
    }
    function onError(error: Error) {
      finish(error);
    }
    function onExit(code: number | null) {
      finish(new Error(`Desktop fixture exited (${code}): ${errors}`));
    }
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onErrorData);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 3_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export const desktopTest = test.extend<{ desktop: DesktopFixture }>({
  desktop: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "ap-e2e-x11-"));
    const children: ChildProcess[] = [];
    try {
      const binary = join(dir, "window");
      await promisify(execFile)(
        "cc",
        ["scripts/fixtures/x11-window.c", "-lX11", "-o", binary],
        { timeout: 10_000 },
      );
      const xvfb = spawn("Xvfb", [
        "-displayfd",
        "1",
        "-screen",
        "0",
        "800x600x24",
        "-nolisten",
        "tcp",
      ]);
      children.push(xvfb);
      const number = await firstLine(xvfb);
      if (!/^\d+$/.test(number))
        throw new Error(`Invalid Xvfb display: ${number}`);
      const display = `:${number}`;
      const window = spawn(binary, [join(dir, "events")], {
        env: { ...process.env, DISPLAY: display },
      });
      children.push(window);
      const ready = (await firstLine(window)).match(/^READY (\d+)$/);
      if (!ready || !window.pid)
        throw new Error("X11 window did not become ready");
      await use({ display, pid: window.pid, windowId: ready[1] });
    } finally {
      for (const child of children.reverse()) await stop(child);
      await rm(dir, { recursive: true, force: true });
    }
  },
  testServer: async ({ desktop }, use) => {
    const server = await startTestServer({ display: desktop.display });
    try {
      await use(server);
    } finally {
      await server.close();
    }
  },
});
