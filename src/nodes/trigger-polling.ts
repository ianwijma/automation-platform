import { executionSignal } from "../core/cancellation.js";
import { createHash } from "node:crypto";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { spawnAndCapture } from "../core/safe-spawn.js";

interface PollingParams {
  intervalSec: number;
  targetType: string;
  target: string;
  stopAfter: number;
}

async function executePoll(
  targetType: string,
  target: string,
  env?: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (targetType === "url") {
    const response = await fetch(target, {
      signal: executionSignal.getStore(),
    });
    const body = await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  }

  if (targetType === "command") {
    const { exitCode, stdout, stderr } = await spawnAndCapture({
      cmd: ["/bin/bash", "-c", target],
      env,
    });
    return {
      exitCode,
      stdout,
      stderr,
    };
  }

  throw new Error(`Unknown polling targetType: ${targetType}`);
}

function hashResult(result: Record<string, unknown>): string {
  const { headers, ...stable } = result;
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
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
    const cursor = `polling:${ctx.nodeId}`;
    const count = Number(ctx.state.get(`${cursor}:count`) ?? 0);
    if (ctx.params.stopAfter > 0 && count >= ctx.params.stopAfter) return [];
    ctx.state.set(`${cursor}:count`, count + 1);
    const result = await executePoll(
      ctx.params.targetType,
      ctx.params.target,
      ctx.env,
    );
    const resultHash = hashResult(result);
    const lastHash = ctx.state.get(`${cursor}:hash`);

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

    ctx.state.set(`${cursor}:hash`, resultHash);
    if (lastHash === resultHash) return [];
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
