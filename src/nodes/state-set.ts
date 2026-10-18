import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { createExpressionEvaluator } from "../core/expressions.js";
import type { ExpressionContext } from "../core/expression-contract.js";

interface StateSetParams {
  key: string;
  valueExpression: string;
}

const definition: NodeDefinition<StateSetParams> = {
  type: "state.set",
  version: 1,
  displayName: "Set State",
  category: "state",
  sideEffecting: true,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    key: { type: "string", description: "State key" },
    valueExpression: { type: "string", description: "Expression for value" },
  },

  async run(ctx: RunContext<StateSetParams>): Promise<NodeItem[]> {
    const evaluator = createExpressionEvaluator();
    const firstItem = ctx.items[0];
    const exprCtx: ExpressionContext = {
      json: firstItem?.json ?? {},
      items: ctx.items,
      node: { id: ctx.nodeId, name: ctx.nodeName },
      env: ctx.env,
      state: ctx.stateSnapshot ?? {},
      now: ctx.now,
    };

    const value = evaluator.evaluate(ctx.params.valueExpression, exprCtx);
    ctx.state.set(ctx.params.key, value);

    return ctx.items;
  },

  async simulate(ctx: RunContext<StateSetParams>): Promise<SimulationReport> {
    await definition.run(ctx); // The executor supplies a run-local state overlay.
    return {
      description: "Set State",
      wouldDo: `would set state key '${ctx.params.key}'`,
      data: ctx.items,
    };
  },
};

nodeRegistry.register(definition);
