import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface PollingParams {
  intervalSec: number;
  targetType: string;
  target: string;
  stopAfter: number;
}

async function executePoll(targetType: string, target: string): Promise<Record<string, unknown>> {
  if (targetType === "url") {
    const response = await fetch(target);
    const body = await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  }

  if (targetType === "command") {
    const proc = Bun.spawn(target.split(/\s+/), {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return {
      exitCode,
      stdout,
      stderr,
    };
  }

  throw new Error(`Unknown polling targetType: ${targetType}`);
}

function hashResult(result: Record<string, unknown>): string {
  const json = JSON.stringify(result);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(16);
}

const definition: NodeDefinition<PollingParams> = {
  type: "trigger.polling",
  version: 1,
  displayName: "Polling Trigger",
  category: "triggers",
  sideEffecting: true,
  inputs: [],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    intervalSec: { type: "number", default: 60 },
    targetType: { type: "string", description: "What to poll: url or command" },
    target: { type: "string", description: "URL or command to poll" },
    stopAfter: { type: "number", description: "Stop after N polls" },
  },

  async run(ctx: RunContext<PollingParams>): Promise<NodeItem[]> {
    const result = await executePoll(ctx.params.targetType, ctx.params.target);
    const resultHash = hashResult(result);
    const lastHash = ctx.state.get("polling:lastHash");

    const items: NodeItem[] = [
      {
        json: {
          triggeredAt: ctx.now.toISOString(),
          targetType: ctx.params.targetType,
          target: ctx.params.target,
          result,
          changed: lastHash !== resultHash,
        },
      },
    ];

    ctx.state.set("polling:lastHash", resultHash);
    return items;
  },

  async simulate(ctx: RunContext<PollingParams>): Promise<SimulationReport> {
    return {
      description: "Polling Trigger",
      wouldDo: `would poll ${ctx.params.targetType} ${ctx.params.target} every ${ctx.params.intervalSec}s`,
    };
  },
};

export { executePoll, hashResult };

nodeRegistry.register(definition);
