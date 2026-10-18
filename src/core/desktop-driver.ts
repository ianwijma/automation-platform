import type { ActionTarget } from "./types.js";
import { spawnAndCapture } from "./safe-spawn.js";
import { delay, executionSignal } from "./cancellation.js";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
export interface DesktopWindow {
  windowId: string;
  title: string;
  pid: number;
  appId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export function displayServer(): "x11" | "wayland" | "none" {
  if (process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY)
    return "wayland";
  return process.env.DISPLAY ? "x11" : "none";
}
async function command(args: string[]): Promise<string> {
  const result = await spawnAndCapture({ cmd: args });
  if (result.exitCode !== 0)
    throw new Error(
      `${args[0]}: ${result.stderr || `exit ${result.exitCode}`}`,
    );
  return result.stdout;
}
export function bridgePath(): string {
  const candidates = [
    process.env.AP_DESKTOP_BRIDGE,
    join(dirname(process.execPath), "ap-desktop-bridge"),
    join(
      import.meta.dir,
      "../../desktop/bridge/target/release/ap-desktop-bridge",
    ),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => existsSync(p)) ?? "ap-desktop-bridge";
}
export async function portalCall(
  request: Record<string, unknown>,
): Promise<any> {
  return JSON.parse(
    await command([bridgePath(), "request", JSON.stringify(request)]),
  );
}
export async function listWindows(): Promise<DesktopWindow[]> {
  if (displayServer() === "wayland")
    return (await portalCall({ op: "windows" })).windows;
  if (displayServer() !== "x11")
    throw new Error("No desktop session available");
  const output = await command(["wmctrl", "-lpGx"]);
  const windows = await Promise.all(
    output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(async (line) => {
        const [windowId, , pid, , , , , appId, , ...title] = line
          .trim()
          .split(/\s+/);
        try {
          // wmctrl geometry can double the origin on non-reparenting window managers.
          // xdotool uses XTranslateCoordinates and gives client coordinates directly.
          const geometry = await command([
            "xdotool",
            "getwindowgeometry",
            "--shell",
            windowId,
          ]);
          const values = Object.fromEntries(
            geometry
              .trim()
              .split("\n")
              .map((line) => line.split("=")),
          );
          return {
            windowId,
            title: title.join(" "),
            pid: Number(pid),
            appId,
            x: Number(values.X),
            y: Number(values.Y),
            width: Number(values.WIDTH),
            height: Number(values.HEIGHT),
          };
        } catch {
          return null;
        } // A window may close between enumeration and inspection.
      }),
  );
  return windows.filter(
    (window): window is DesktopWindow & { appId: string } => window !== null,
  );
}
export async function resolveWindow(
  target: ActionTarget,
): Promise<DesktopWindow> {
  if (!target.windowId && !target.windowTitle && !target.pid && !target.appId)
    throw new Error("Window target requires ID, title, PID, or application");
  const matches = (await listWindows()).filter(
    (w) =>
      (!target.windowId ||
        w.windowId === target.windowId ||
        Number(w.windowId) === Number(target.windowId)) &&
      (!target.windowTitle || new RegExp(target.windowTitle).test(w.title)) &&
      (!target.pid || w.pid === target.pid) &&
      (!target.appId || w.appId === target.appId),
  );
  if (matches.length !== 1)
    throw new Error(
      `Window target matched ${matches.length} windows; make the selector unambiguous`,
    );
  return matches[0];
}
export async function focusWindow(window: DesktopWindow): Promise<void> {
  if (displayServer() === "wayland")
    await portalCall({ op: "focus", windowId: window.windowId });
  else await command(["xdotool", "windowactivate", "--sync", window.windowId]);
}
export async function desktopInput(
  op: "move" | "click" | "key" | "type",
  params: Record<string, unknown>,
  target?: ActionTarget,
): Promise<void> {
  const window =
    target?.kind === "window" ? await resolveWindow(target) : undefined;
  if (window) await focusWindow(window);
  const origin =
    window ?? (target?.kind === "region" ? target.region : undefined);
  const x = Number(params.x ?? 0) + (origin?.x ?? 0),
    y = Number(params.y ?? 0) + (origin?.y ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error("Invalid pointer coordinates");
  if (
    origin &&
    (Number(params.x ?? 0) < 0 ||
      Number(params.y ?? 0) < 0 ||
      Number(params.x ?? 0) >= origin.width ||
      Number(params.y ?? 0) >= origin.height)
  )
    throw new Error("Pointer is outside the target");
  if (displayServer() === "wayland") {
    await portalCall({ op, ...params, x, y, monitor: target?.monitor });
    return;
  }
  if (displayServer() !== "x11")
    throw new Error("No desktop session available");
  if (op === "move" || op === "click")
    await command([
      "xdotool",
      "mousemove",
      "--sync",
      String(Math.round(x)),
      String(Math.round(y)),
    ]);
  if (op === "click") {
    const button = { left: 1, middle: 2, right: 3 }[
      String(params.button ?? "left")
    ];
    const count = Number(params.clickCount ?? 1);
    if (!button || !Number.isInteger(count) || count < 1 || count > 20)
      throw new Error("Invalid button or click count");
    await command([
      "xdotool",
      "click",
      "--repeat",
      String(count),
      "--delay",
      "100",
      String(button),
    ]);
  }
  if (op === "type")
    await command([
      "xdotool",
      "type",
      "--clearmodifiers",
      "--delay",
      String(Number(params.delay ?? 12)),
      "--",
      String(params.text ?? ""),
    ]);
  if (op === "key") {
    const key = String(params.key ?? "");
    if (!/^[A-Za-z0-9_+]+$/.test(key))
      throw new Error("Invalid key combination");
    await command(["xdotool", "key", "--clearmodifiers", key]);
  }
}
export async function captureDesktop(
  path: string,
  target?: ActionTarget,
  activate = true,
  delayMs = 200,
): Promise<void> {
  const window =
    target?.kind === "window" ? await resolveWindow(target) : undefined;
  if (window && activate) await focusWindow(window);
  if (window) await delay(delayMs, executionSignal.getStore());
  if (displayServer() === "wayland") {
    await portalCall({
      op: "capture",
      path,
      region: window ?? target?.region,
      monitor: target?.monitor,
    });
    return;
  }
  if (displayServer() !== "x11")
    throw new Error("No desktop session available");
  if (target?.kind === "region" && target.region) {
    const r = target.region,
      geometry = `${r.width}x${r.height}${r.x < 0 ? "" : "+"}${r.x}${r.y < 0 ? "" : "+"}${r.y}`;
    try {
      await command(["maim", "-g", geometry, path]);
    } catch {
      await command(["import", "-window", "root", "-crop", geometry, path]);
    }
    return;
  }
  let error: unknown;
  for (const args of window
    ? [
        ["maim", "-i", window.windowId, path],
        ["import", "-window", window.windowId, path],
      ]
    : [
        ["maim", path],
        ["scrot", path],
        ["import", "-window", "root", path],
      ]) {
    try {
      await command(args);
      return;
    } catch (e) {
      error = e;
    }
  }
  throw error;
}
