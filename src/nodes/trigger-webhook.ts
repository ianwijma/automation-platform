import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface WebhookParams {
  path: string;
  method: string;
}

const definition: NodeDefinition<WebhookParams> = {
  type: "trigger.webhook",
  version: 1,
  displayName: "Webhook Trigger",
  category: "triggers",
  sideEffecting: false,
  inputs: [],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    path: { type: "string", description: "Webhook URL path suffix" },
    method: { type: "string", default: "POST" },
  },

  async run(ctx: RunContext<WebhookParams>): Promise<NodeItem[]> {
    const event = ctx.items[0]?.json ?? {};
    const webhookBody = event.body ?? event;
    return [
      {
        json: {
          triggeredAt: ctx.now.toISOString(),
          webhookPath: ctx.params.path,
          method: ctx.params.method ?? "POST",
          body: webhookBody,
        },
      },
    ];
  },

  async simulate(ctx: RunContext<WebhookParams>): Promise<SimulationReport> {
    const autoId = ctx.runId;
    return {
      description: "Webhook Trigger",
      wouldDo: `would accept ${ctx.params.method} at /hooks/${autoId}/${ctx.params.path}`,
    };
  },
};

nodeRegistry.register(definition);
