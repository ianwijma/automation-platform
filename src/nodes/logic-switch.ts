import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { createExpressionEvaluator } from "../core/expressions.js";
import type { ExpressionContext } from "../core/expression-contract.js";

interface SwitchRule {
  label: string;
  expression: string;
}

interface SwitchParams {
  rules: SwitchRule[];
  fallback?: string;
}

const definition: NodeDefinition<SwitchParams> = {
  type: "logic.switch",
  version: 1,
  displayName: "Switch",
  category: "logic",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    rules: {
      type: "array",
      description: "Switch rules",
      items: {
        label: { type: "string" },
        expression: { type: "string" },
      },
    },
    fallback: { type: "string", description: "Default output label" },
  },

  async run(ctx: RunContext<SwitchParams>): Promise<NodeItem[]> {
    const evaluator = createExpressionEvaluator();
    const rules = ctx.params.rules ?? [];
    const fallback = ctx.params.fallback ?? "default";

    return ctx.items.map((item) => {
      const exprCtx: ExpressionContext = {
        json: item.json,
        items: ctx.items,
        node: { id: ctx.nodeId, name: ctx.nodeName },
        env: ctx.env,
        state: {},
        now: ctx.now,
      };

      let branch = fallback;
      for (const rule of rules) {
        const result = evaluator.evaluate(rule.expression, exprCtx);
        if (result) {
          branch = rule.label;
          break;
        }
      }

      return {
        json: { ...item.json, _branch: branch },
        binary: item.binary,
      };
    });
  },

  async simulate(ctx: RunContext<SwitchParams>): Promise<SimulationReport> {
    const rules = ctx.params.rules ?? [];
    const labels = rules.map((r) => r.label).join(", ");
    return {
      description: "Switch",
      wouldDo: `would evaluate rules: [${labels}], fallback: ${ctx.params.fallback ?? "default"}`,
    };
  },
};

nodeRegistry.register(definition);
