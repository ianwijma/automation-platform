import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { safeSpawn } from "../core/safe-spawn.js";

interface LaunchParams {
  command: string;
  shell?: string;
  waitForWindowSec?: number;
}

function detectDisplayServer(): "x11" | "wayland" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if (sessionType === "wayland") return "wayland";
  if (sessionType === "x11") return "x11";
  if (process.env.WAYLAND_DISPLAY) return "wayland";
  if (process.env.DISPLAY) return "x11";
  return "none";
}

async function pollX11Window(pid: number, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const proc = Bun.spawn(["xdotool", "search", "--pid", String(pid)], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const stdout = await new Response(proc.stdout).text();
        const trimmed = stdout.trim();
        if (trimmed.length > 0) {
          return trimmed.split("\n")[0].trim();
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function pollWaylandWindow(pid: number, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const proc = Bun.spawn(["hyprctl", "clients", "-j"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const stdout = await new Response(proc.stdout).text();
        const clients = JSON.parse(stdout);
        const match = clients.find((c: Record<string, unknown>) => c.pid === pid);
        if (match) return String(match.address);
      }
    } catch {}

    try {
      const proc = Bun.spawn(["swaymsg", "-t", "get_tree", "-r"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const stdout = await new Response(proc.stdout).text();
        const tree = JSON.parse(stdout);
        const found = findSwayNodeByPid(tree, pid);
        if (found) return String(found.id);
      }
    } catch {}

    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function findSwayNodeByPid(node: Record<string, unknown>, pid: number): Record<string, unknown> | null {
  if (node.pid === pid) return node;
  const children = (node.nodes as Record<string, unknown>[]) ?? [];
  const floating = (node.floating_nodes as Record<string, unknown>[]) ?? [];
  for (const child of [...children, ...floating]) {
    const found = findSwayNodeByPid(child, pid);
    if (found) return found;
  }
  return null;
}

const definition: NodeDefinition<LaunchParams> = {
  type: "system.launch",
  version: 1,
  displayName: "Launch Program",
  category: "execution",
  icon: "🚀",
  sideEffecting: true,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    command: { type: "string", description: "Command to launch" },
    shell: { type: "string", default: "/bin/bash" },
    waitForWindowSec: { type: "number", default: 0, description: "Seconds to wait for a window to appear (0 = don't wait)" },
  },

  async run(ctx: RunContext<LaunchParams>): Promise<NodeItem[]> {
    const command = ctx.params.command;
    const shell = ctx.params.shell ?? "/bin/bash";
    const waitForWindowSec = ctx.params.waitForWindowSec ?? 0;

    const proc = await safeSpawn({
      cmd: [shell, "-c", command],
      env: { ...ctx.env },
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();

    const pid = proc.pid;
    let windowId: string | null = null;

    if (waitForWindowSec > 0) {
      const displayServer = detectDisplayServer();
      const timeoutMs = waitForWindowSec * 1000;

      if (displayServer === "x11") {
        windowId = await pollX11Window(pid, timeoutMs);
      } else if (displayServer === "wayland") {
        windowId = await pollWaylandWindow(pid, timeoutMs);
      }
    }

    return [
      {
        json: {
          pid,
          command,
          startedAt: ctx.now.toISOString(),
          windowId: windowId || null,
        },
      },
    ];
  },

  async simulate(ctx: RunContext<LaunchParams>): Promise<SimulationReport> {
    return {
      description: "Launch Program",
      wouldDo: `would launch command: '${ctx.params.command}'`,
    };
  },
};

nodeRegistry.register(definition);
