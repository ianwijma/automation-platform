import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { spawnAndCapture } from "../core/safe-spawn.js";

interface CommandParams {
  command: string;
  shell?: string;
}

const definition: NodeDefinition<CommandParams> = {
  type: "system.command",
  version: 1,
  displayName: "Execute Command",
  category: "execution",
  sideEffecting: true,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }, { name: "error", type: "item" }],
  paramsSchema: {
    command: { type: "string", description: "Shell command" },
    shell: { type: "string", default: "/bin/bash" },
  },

  async run(ctx: RunContext<CommandParams>): Promise<NodeItem[]> {
    const command = ctx.params.command;
    const shell = ctx.params.shell ?? "/bin/bash";

    const { exitCode, stdout, stderr } = await spawnAndCapture({
      cmd: [shell, "-c", command],
      env: { ...ctx.env },
    });

    const result: Record<string, unknown> = { stdout, stderr, exitCode };

    if (exitCode !== 0) {
      result._branch = "error";
    }

    return [{ json: result }];
  },

  async simulate(ctx: RunContext<CommandParams>): Promise<SimulationReport> {
    return {
      description: "Execute Command",
      wouldDo: `would run: ${ctx.params.command}`,
    };
  },
};

nodeRegistry.register(definition);
