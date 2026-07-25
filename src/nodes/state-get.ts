import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface StateGetParams {
  key: string;
}

const definition: NodeDefinition<StateGetParams> = {
  type: "state.get",
  version: 1,
  displayName: "Get State",
  category: "state",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    key: { type: "string", description: "State key to read" },
  },

  async run(ctx: RunContext<StateGetParams>): Promise<NodeItem[]> {
    const key = ctx.params.key;
    const value = ctx.state.get(key);

    return ctx.items.map((item) => ({
      json: { ...item.json, [`state_${key}`]: value },
      binary: item.binary,
    }));
  },

  async simulate(ctx: RunContext<StateGetParams>): Promise<SimulationReport> {
    return {
      description: "Get State",
      wouldDo: `would read state key '${ctx.params.key}'`,
    };
  },
};

nodeRegistry.register(definition);
