import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface ScheduleParams {
  cron: string;
  timezone: string;
}

const definition: NodeDefinition<ScheduleParams> = {
  type: "trigger.schedule",
  version: 1,
  displayName: "Schedule Trigger",
  category: "triggers",
  sideEffecting: false,
  inputs: [],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    cron: { type: "string", description: "Cron expression" },
    timezone: { type: "string", default: "UTC" },
  },

  async run(ctx: RunContext<ScheduleParams>): Promise<NodeItem[]> {
    return [
      {
        json: {
          triggeredAt: ctx.now.toISOString(),
          cron: ctx.params.cron,
        },
      },
    ];
  },

  async simulate(ctx: RunContext<ScheduleParams>): Promise<SimulationReport> {
    return {
      description: "Schedule Trigger",
      wouldDo: `would fire on cron '${ctx.params.cron}'`,
    };
  },
};

nodeRegistry.register(definition);
