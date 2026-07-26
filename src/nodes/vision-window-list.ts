import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface WindowListParams {
  filter?: string;
  pid?: number;
  includeGeometry?: boolean;
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

const definition: NodeDefinition<WindowListParams> = {
  type: "vision.window.list",
  version: 1,
  displayName: "List Windows",
  category: "vision",
  icon: "🪟",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    filter: { type: "string", default: "", description: "Regex to filter window titles" },
    pid: { type: "number", default: 0, description: "Filter by process ID (0 = no filter)" },
    includeGeometry: { type: "boolean", default: true, description: "Include window position and size" },
  },

  async run(ctx: RunContext<WindowListParams>): Promise<NodeItem[]> {
    const filter = ctx.params.filter ?? "";
    const pid = ctx.params.pid ?? 0;
    const includeGeometry = ctx.params.includeGeometry ?? true;

    const displayServer = detectDisplayServer();
    const windows: Record<string, unknown>[] = [];

    if (displayServer === "x11") {
      const result = await spawnCapture(["wmctrl", "-l", "-p", "-G"]);
      if (!result.ok) {
        throw new Error(`wmctrl failed: ${result.stderr}`);
      }
      const lines = result.stdout.trim().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;
        const windowId = parts[0];
        const desktop = parseInt(parts[1], 10);
        const wPid = parseInt(parts[2], 10);
        const x = parseInt(parts[3], 10);
        const y = parseInt(parts[4], 10);
        const width = parseInt(parts[5], 10);
        const height = parseInt(parts[6], 10);
        const title = parts.slice(8).join(" ");

        const entry: Record<string, unknown> = { windowId, desktop, pid: wPid, title };
        if (includeGeometry) {
          entry.x = x;
          entry.y = y;
          entry.width = width;
          entry.height = height;
        }
        windows.push(entry);
      }
    } else if (displayServer === "wayland") {
      let waylandOk = false;

      const hyprResult = await spawnCapture(["hyprctl", "clients", "-j"]);
      if (hyprResult.ok) {
        waylandOk = true;
        try {
          const clients = JSON.parse(hyprResult.stdout);
          for (const client of clients) {
            const entry: Record<string, unknown> = {
              windowId: client.address,
              desktop: 0,
              pid: client.pid,
              title: client.title || client.class,
            };
            if (includeGeometry) {
              const at = client.at as number[] | undefined;
              const size = client.size as number[] | undefined;
              entry.x = at?.[0] ?? 0;
              entry.y = at?.[1] ?? 0;
              entry.width = size?.[0] ?? 0;
              entry.height = size?.[1] ?? 0;
            }
            windows.push(entry);
          }
        } catch {}
      }

      if (!waylandOk) {
        const swayResult = await spawnCapture(["swaymsg", "-t", "get_tree", "-r"]);
        if (swayResult.ok) {
          waylandOk = true;
          try {
            const tree = JSON.parse(swayResult.stdout);
            const leaves: Record<string, unknown>[] = [];
            collectSwayNodes(tree, leaves);
            for (const leaf of leaves) {
              const entry: Record<string, unknown> = {
                windowId: String(leaf.id),
                desktop: 0,
                pid: leaf.pid,
                title: leaf.name || leaf.app_id,
              };
              if (includeGeometry) {
                const rect = leaf.rect as Record<string, number> | undefined;
                entry.x = rect?.x ?? 0;
                entry.y = rect?.y ?? 0;
                entry.width = rect?.width ?? 0;
                entry.height = rect?.height ?? 0;
              }
              windows.push(entry);
            }
          } catch {}
        }
      }

      if (!waylandOk) {
        throw new Error("Window listing requires X11 (wmctrl) or a wlroots compositor (Hyprland/Sway)");
      }
    } else {
      throw new Error("Window listing requires X11 (wmctrl) or a wlroots compositor (Hyprland/Sway)");
    }

    const filtered = windows.filter((w) => {
      if (pid > 0 && w.pid !== pid) return false;
      if (filter && !new RegExp(filter).test(String(w.title))) return false;
      return true;
    });

    return filtered.map((w) => ({ json: w }));
  },

  async simulate(_ctx: RunContext<WindowListParams>): Promise<SimulationReport> {
    return {
      description: "List Windows",
      wouldDo: "would list windows matching filter",
    };
  },
};

nodeRegistry.register(definition);
