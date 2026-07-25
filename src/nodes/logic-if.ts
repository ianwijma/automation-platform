import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { createExpressionEvaluator } from "../core/expressions.js";
import type { ExpressionContext } from "../core/expression-contract.js";

interface IfParams {
  condition: string;
}

const definition: NodeDefinition<IfParams> = {
  type: "logic.if",
  version: 1,
  displayName: "IF",
  category: "logic",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "true", type: "item" }, { name: "false", type: "item" }],
  paramsSchema: {
    condition: { type: "string", description: "Expression to evaluate" },
  },

  async run(ctx: RunContext<IfParams>): Promise<NodeItem[]> {
    const evaluator = createExpressionEvaluator();
    const firstItem = ctx.items[0];
    const exprCtx: ExpressionContext = {
      json: firstItem?.json ?? {},
      items: ctx.items,
      node: { id: ctx.nodeId, name: ctx.nodeName },
      env: ctx.env,
      state: {},
      now: ctx.now,
    };

    const result = evaluator.evaluate(ctx.params.condition, exprCtx);
    const branch = result ? "true" : "false";

    return ctx.items.map((item) => ({
      json: { ...item.json, _branch: branch },
      binary: item.binary,
    }));
  },

  async simulate(ctx: RunContext<IfParams>): Promise<SimulationReport> {
    return {
      description: "IF",
      wouldDo: `would evaluate condition: ${ctx.params.condition}`,
    };
  },
};

nodeRegistry.register(definition);
