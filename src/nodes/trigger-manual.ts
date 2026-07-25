import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

const definition: NodeDefinition = {
  type: "trigger.manual",
  version: 1,
  displayName: "Manual Trigger",
  category: "triggers",
  sideEffecting: false,
  inputs: [],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {},

  async run(_ctx: RunContext): Promise<NodeItem[]> {
    return [{ json: {} }];
  },

  async simulate(_ctx: RunContext): Promise<SimulationReport> {
    return {
      description: "Manual trigger",
      wouldDo: "Start workflow manually",
      data: [{ json: {} }],
    };
  },
};

nodeRegistry.register(definition);
