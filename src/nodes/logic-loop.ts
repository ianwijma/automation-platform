import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface LoopParams {
  batchSize: number;
}

const definition: NodeDefinition<LoopParams> = {
  type: "logic.loop",
  version: 1,
  displayName: "Loop",
  category: "logic",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }, { name: "done", type: "item" }],
  paramsSchema: {
    batchSize: { type: "number", default: 1, description: "Items per iteration" },
  },

  async run(ctx: RunContext<LoopParams>): Promise<NodeItem[]> {
    const batchSize = ctx.params.batchSize ?? 1;
    const totalBatches = Math.ceil(ctx.items.length / batchSize);

    const batched: NodeItem[] = [];
    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, ctx.items.length);
      for (let j = start; j < end; j++) {
        batched.push({
          json: { ...ctx.items[j].json, _loopIndex: i },
          binary: ctx.items[j].binary,
        });
      }
    }

    const done: NodeItem[] = ctx.items.map((item) => ({
      json: { ...item.json, _branch: "done" },
      binary: item.binary,
    }));

    return [...batched, ...done];
  },

  async simulate(ctx: RunContext<LoopParams>): Promise<SimulationReport> {
    const batchSize = ctx.params.batchSize ?? 1;
    const totalBatches = Math.ceil(ctx.items.length / batchSize);
    return {
      description: "Loop",
      wouldDo: `would loop ${ctx.items.length} items in ${totalBatches} batches of ${batchSize}`,
    };
  },
};

nodeRegistry.register(definition);
