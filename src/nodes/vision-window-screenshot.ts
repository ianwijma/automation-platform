import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface WindowScreenshotParams {
  windowId?: string;
  pid?: number;
  title?: string;
  activateFirst?: boolean;
  delayMs?: number;
}

function detectDisplayServer(): "x11" | "wayland" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if (sessionType === "wayland") return "wayland";
  if (sessionType === "x11") return "x11";
  if (process.env.WAYLAND_DISPLAY) return "wayland";
  if (process.env.DISPLAY) return "x11";
  return "none";
}

async function spawnCapture(cmd: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { ok: exitCode === 0, stdout, stderr };
  } catch (e: unknown) {
    return { ok: false, stdout: "", stderr: String(e) };
  }
}

async function resolveX11Window(params: WindowScreenshotParams): Promise<string> {
  if (params.windowId && params.windowId.trim()) return params.windowId.trim();

  if (params.pid && params.pid > 0) {
    const result = await spawnCapture(["xdotool", "search", "--pid", String(params.pid)]);
    if (result.ok) {
      const lines = result.stdout.trim().split("\n");
      if (lines.length > 0 && lines[0].trim()) return lines[0].trim();
    }
  }

  if (params.title && params.title.trim()) {
    const result = await spawnCapture(["xdotool", "search", "--name", params.title]);
    if (result.ok) {
      const lines = result.stdout.trim().split("\n");
      if (lines.length > 0 && lines[0].trim()) return lines[0].trim();
    }
  }

  throw new Error("Could not find window");
}

async function resolveWaylandWindow(params: WindowScreenshotParams): Promise<{ windowId: string; x: number; y: number; width: number; height: number; title: string | null }> {
  if (params.windowId && params.windowId.trim()) {
    const result = await spawnCapture(["hyprctl", "clients", "-j"]);
    if (result.ok) {
      try {
        const clients = JSON.parse(result.stdout);
        const match = clients.find((c: Record<string, unknown>) => c.address === params.windowId);
        if (match) {
          const at = match.at as number[];
          const size = match.size as number[];
          return {
            windowId: match.address,
            x: at?.[0] ?? 0,
            y: at?.[1] ?? 0,
            width: size?.[0] ?? 0,
            height: size?.[1] ?? 0,
          title: (match.title ? String(match.title) : match.class ? String(match.class) : null) as string | null,
          };
        }
      } catch {}
    }
    throw new Error("Could not find window");
  }

  const hyprResult = await spawnCapture(["hyprctl", "clients", "-j"]);
  if (hyprResult.ok) {
    try {
      const clients = JSON.parse(hyprResult.stdout);
      let match: Record<string, unknown> | undefined;
      if (params.pid && params.pid > 0) {
        match = clients.find((c: Record<string, unknown>) => c.pid === params.pid);
      } else if (params.title && params.title.trim()) {
        const re = new RegExp(params.title);
        match = clients.find((c: Record<string, unknown>) => re.test(String(c.title || c.class)));
      }
      if (match) {
        const at = match.at as number[];
        const size = match.size as number[];
        return {
          windowId: String(match.address),
          x: at?.[0] ?? 0,
          y: at?.[1] ?? 0,
          width: size?.[0] ?? 0,
          height: size?.[1] ?? 0,
          title: (match.title ? String(match.title) : match.class ? String(match.class) : null) as string | null,
        };
      }
    } catch {}
  }

  const swayResult = await spawnCapture(["swaymsg", "-t", "get_tree", "-r"]);
  if (swayResult.ok) {
    try {
      const tree = JSON.parse(swayResult.stdout);
      const leaves: Record<string, unknown>[] = [];
      collectSwayNodes(tree, leaves);
      let match: Record<string, unknown> | undefined;
      if (params.pid && params.pid > 0) {
        match = leaves.find((l: Record<string, unknown>) => l.pid === params.pid);
      } else if (params.title && params.title.trim()) {
        const re = new RegExp(params.title);
        match = leaves.find((l: Record<string, unknown>) => re.test(String(l.name || l.app_id)));
      }
      if (match) {
        const rect = match.rect as Record<string, number>;
        return {
          windowId: String(match.id),
          x: rect?.x ?? 0,
          y: rect?.y ?? 0,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
          title: (match.name ? String(match.name) : match.app_id ? String(match.app_id) : null) as string | null,
        };
      }
    } catch {}
  }

  throw new Error("Could not find window");
}

function collectSwayNodes(node: Record<string, unknown>, results: Record<string, unknown>[]): void {
  const nodes = (node.nodes as Record<string, unknown>[]) ?? [];
  const floating = (node.floating_nodes as Record<string, unknown>[]) ?? [];
  for (const child of [...nodes, ...floating]) {
    if (child.pid != null && (child.name || child.app_id)) {
      results.push(child);
    }
    collectSwayNodes(child, results);
  }
}

async function isGnomeOrKdeWayland(): Promise<boolean> {
  const desktop = process.env.XDG_CURRENT_DESKTOP ?? "";
  if (/gnome/i.test(desktop) || /kde/i.test(desktop)) return true;

  const result = await spawnCapture(["hyprctl", "version"]);
  if (result.ok) return false;
  const swayResult = await spawnCapture(["swaymsg", "-t", "get_version"]);
  if (swayResult.ok) return false;

  return true;
}

const definition: NodeDefinition<WindowScreenshotParams> = {
  type: "vision.window.screenshot",
  version: 1,
  displayName: "Window Screenshot",
  category: "vision",
  icon: "🖼️",
  sideEffecting: true,
  requiredCapabilities: { screen: true },
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    windowId: { type: "string", default: "", description: "Hex window ID (e.g. 0x05600004)" },
    pid: { type: "number", default: 0, description: "Filter by process ID (0 = use windowId instead)" },
    title: { type: "string", default: "", description: "Regex to find window by title" },
    activateFirst: { type: "boolean", default: true, description: "Activate window before capture" },
    delayMs: { type: "number", default: 200, description: "Delay after activation in ms" },
  },

  async run(ctx: RunContext<WindowScreenshotParams>): Promise<NodeItem[]> {
    const displayServer = detectDisplayServer();
    const activateFirst = ctx.params.activateFirst ?? true;
    const delayMs = ctx.params.delayMs ?? 200;
    const windowId = ctx.params.windowId ?? "";
    const pid = ctx.params.pid ?? 0;
    const title = ctx.params.title ?? "";
    const screenshotPath = `/tmp/ap_window_screenshot_${ctx.runId}_${ctx.nodeId}.png`;

    let resolvedWinId: string;
    let resolvedTitle: string | null = null;

    if (displayServer === "x11") {
      resolvedWinId = await resolveX11Window({ windowId, pid, title });

      if (activateFirst) {
        await spawnCapture(["xdotool", "windowactivate", "--sync", resolvedWinId]);
      }

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      let captured = false;
      let lastError = "";

      const maimResult = await spawnCapture(["maim", "-i", resolvedWinId, screenshotPath]);
      if (maimResult.ok) {
        captured = true;
      } else {
        lastError = maimResult.stderr;
        const importResult = await spawnCapture(["import", "-window", resolvedWinId, screenshotPath]);
        if (importResult.ok) {
          captured = true;
        } else {
          lastError = importResult.stderr;
        }
      }

      if (!captured) {
        throw new Error(`Failed to capture window screenshot on X11. Last error: ${lastError}. Install maim or imagemagick.`);
      }

      try {
        const titleResult = await spawnCapture(["xdotool", "getwindowname", resolvedWinId]);
        if (titleResult.ok) resolvedTitle = titleResult.stdout.trim() || null;
      } catch {}
    } else if (displayServer === "wayland") {
      const gnomeOrKde = await isGnomeOrKdeWayland();
      if (gnomeOrKde) {
        throw new Error("Per-window screenshot not supported on this compositor. Use the full Screenshot node instead.");
      }

      const resolved = await resolveWaylandWindow({ windowId, pid, title });
      resolvedWinId = resolved.windowId;
      resolvedTitle = resolved.title;

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const grimResult = await spawnCapture(["grim", "-g", `${resolved.x},${resolved.y} ${resolved.width}x${resolved.height}`, screenshotPath]);
      if (!grimResult.ok) {
        throw new Error(`Failed to capture window screenshot on Wayland. Install grim.`);
      }
    } else {
      throw new Error("No display server detected. Cannot capture window screenshot.");
    }

    const file = Bun.file(screenshotPath);
    const exists = await file.exists();
    if (!exists) {
      throw new Error("Screenshot file was not created");
    }

    const buffer = await file.arrayBuffer();
    const size = buffer.byteLength;

    let width = 0;
    let height = 0;
    try {
      const identifyProc = Bun.spawn(["identify", "-format", "%w %h", screenshotPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const identifyExit = await identifyProc.exited;
      if (identifyExit === 0) {
        const out = await new Response(identifyProc.stdout).text();
        const parts = out.trim().split(" ");
        width = parseInt(parts[0], 10) || 0;
        height = parseInt(parts[1], 10) || 0;
      }
    } catch {}

    const item: NodeItem = {
      json: {
        filename: screenshotPath,
        width,
        height,
        windowId: resolvedWinId,
        title: resolvedTitle || null,
      },
      binary: {
        screenshot: {
          $artifact: "pending",
          mime: "image/png",
          size,
          name: "screenshot.png",
        },
      },
    };

    if (ctx.artifacts) {
      const ref = await ctx.artifacts.store(buffer, "image/png", "screenshot.png");
      item.binary!.screenshot = ref;
    }

    return [item];
  },

  async simulate(_ctx: RunContext<WindowScreenshotParams>): Promise<SimulationReport> {
    return {
      description: "Window Screenshot",
      wouldDo: "would capture screenshot of window",
    };
  },
};

nodeRegistry.register(definition);
