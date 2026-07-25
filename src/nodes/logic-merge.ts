import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface MergeParams {
  mode?: "append" | "keep-key";
  keyField?: string;
}

const definition: NodeDefinition<MergeParams> = {
  type: "logic.merge",
  version: 1,
  displayName: "Merge",
  category: "logic",
  sideEffecting: false,
  inputs: [{ name: "in1", type: "item" }, { name: "in2", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    mode: { type: "string", default: "append", description: "append or keep-key" },
    keyField: { type: "string", description: "Key field for deduplication in keep-key mode" },
  },

  async run(ctx: RunContext<MergeParams>): Promise<NodeItem[]> {
    const mode = ctx.params.mode ?? "append";
    const keyField = ctx.params.keyField ?? "id";
    const allItems = [...ctx.items];

    if (mode === "append") {
      return allItems;
    }

    const seen = new Map<unknown, NodeItem>();
    for (const item of allItems) {
      const key = item.json[keyField];
      if (key !== undefined && !seen.has(key)) {
        seen.set(key, item);
      }
    }
    return [...seen.values()];
  },

  async simulate(ctx: RunContext<MergeParams>): Promise<SimulationReport> {
    const mode = ctx.params.mode ?? "append";
    return {
      description: "Merge",
      wouldDo: `would merge ${ctx.items.length} items in ${mode} mode`,
    };
  },
};

nodeRegistry.register(definition);
