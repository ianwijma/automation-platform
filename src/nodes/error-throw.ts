import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface ErrorThrowParams {
  message: string;
}

const definition: NodeDefinition<ErrorThrowParams> = {
  type: "error.throw",
  version: 1,
  displayName: "Throw Error",
  category: "logic",
  sideEffecting: true,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "error", type: "item" }],
  paramsSchema: {
    message: { type: "string", description: "Error message" },
  },

  async run(ctx: RunContext<ErrorThrowParams>): Promise<NodeItem[]> {
    throw new Error(ctx.params.message);
  },

  async simulate(ctx: RunContext<ErrorThrowParams>): Promise<SimulationReport> {
    return {
      description: "Throw Error",
      wouldDo: `would throw error: '${ctx.params.message}'`,
    };
  },
};

nodeRegistry.register(definition);
