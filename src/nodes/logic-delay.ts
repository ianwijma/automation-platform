import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface DelayParams {
  seconds: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const definition: NodeDefinition<DelayParams> = {
  type: "logic.delay",
  version: 1,
  displayName: "Delay",
  category: "logic",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    seconds: { type: "number", description: "Seconds to delay", default: 1 },
  },

  async run(ctx: RunContext<DelayParams>): Promise<NodeItem[]> {
    const seconds = ctx.params.seconds ?? 1;
    await sleep(seconds * 1000);
    return ctx.items;
  },

  async simulate(ctx: RunContext<DelayParams>): Promise<SimulationReport> {
    const seconds = ctx.params.seconds ?? 1;
    return {
      description: "Delay",
      wouldDo: `would wait ${seconds}s`,
    };
  },
};

nodeRegistry.register(definition);
