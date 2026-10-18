import { listWindows } from "../core/desktop-driver.js";
import { delay } from "../core/cancellation.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { safeSpawn } from "../core/safe-spawn.js";

interface LaunchParams {
  command: string;
  shell?: string;
  waitForWindowSec?: number;
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
    waitForWindowSec: {
      type: "number",
      default: 0,
      description: "Seconds to wait for a window to appear (0 = don't wait)",
    },
  },

  async run(ctx: RunContext<LaunchParams>): Promise<NodeItem[]> {
    const command = ctx.params.command;
    const shell = ctx.params.shell ?? "/bin/bash";
    const waitForWindowSec = ctx.params.waitForWindowSec ?? 0;

    const proc = await safeSpawn({
      cmd: [shell, "-c", `exec ${command}`],
      env: { ...ctx.env },
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();

    const pid = proc.pid;
    let windowId: string | null = null;

    if (waitForWindowSec > 0) {
      const deadline = Date.now() + waitForWindowSec * 1000;
      while (Date.now() < deadline) {
        ctx.signal?.throwIfAborted();
        const window = (await listWindows()).find((w) => w.pid === pid);
        if (window) {
          windowId = window.windowId;
          break;
        }
        await delay(200, ctx.signal);
      }
      if (!windowId) {
        proc.kill();
        throw new Error(
          "Launched process did not create a window before the deadline",
        );
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
