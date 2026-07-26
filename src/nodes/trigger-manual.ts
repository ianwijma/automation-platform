import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface ManualTriggerParams {
  testData?: string;
}

function parseTestData(raw: string | undefined): NodeItem[] {
  if (!raw || raw.trim() === "") return [{ json: {} }];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item: any) => ({ json: item.json ?? item }));
    return [{ json: parsed }];
  } catch {
    return [{ json: { raw } }];
  }
}

const definition: NodeDefinition<ManualTriggerParams> = {
  type: "trigger.manual",
  version: 1,
  displayName: "Manual Trigger",
  category: "triggers",
  sideEffecting: false,
  inputs: [],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    testData: { type: "object", description: "Test input data (JSON) for Execute Node" },
  },

  async run(ctx: RunContext<ManualTriggerParams>): Promise<NodeItem[]> {
    return parseTestData(ctx.params.testData as string | undefined);
  },

  async simulate(ctx: RunContext<ManualTriggerParams>): Promise<SimulationReport> {
    return {
      description: "Manual trigger",
      wouldDo: "Start workflow manually",
      data: parseTestData(ctx.params.testData as string | undefined),
    };
  },
};

nodeRegistry.register(definition);
