import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";
import { resolveParams } from "../core/expressions.js";
import type { ExpressionContext } from "../core/expression-contract.js";

interface Assignment {
  field: string;
  value: unknown;
}

interface LogicSetParams {
  assignments: Assignment[];
}

const definition: NodeDefinition<LogicSetParams> = {
  type: "logic.set",
  version: 1,
  displayName: "Set Fields",
  category: "logic",
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    assignments: {
      type: "array",
      description: "Field assignments",
      items: { field: { type: "string" }, value: { type: "string" } },
    },
  },

  async run(ctx: RunContext<LogicSetParams>): Promise<NodeItem[]> {
    const assignments = ctx.params.assignments ?? [];

    return ctx.items.map((item) => {
      const exprCtx: ExpressionContext = {
        json: item.json,
        items: ctx.items,
        node: { id: ctx.nodeId, name: ctx.nodeName },
        env: ctx.env,
        state: ctx.stateSnapshot ?? {},
        now: ctx.now,
      };

      const updated = { ...item.json };
      for (const assignment of assignments) {
        const resolved = resolveParams(
          { value: assignment.value },
          exprCtx,
        ).value;
        updated[assignment.field] = resolved;
      }

      return { json: updated, binary: item.binary };
    });
  },

  async simulate(ctx: RunContext<LogicSetParams>): Promise<SimulationReport> {
    const assignments = ctx.params.assignments ?? [];

    const items = ctx.items.map((item) => {
      const exprCtx: ExpressionContext = {
        json: item.json,
        items: ctx.items,
        node: { id: ctx.nodeId, name: ctx.nodeName },
        env: ctx.env,
        state: ctx.stateSnapshot ?? {},
        now: ctx.now,
      };

      const updated = { ...item.json };
      for (const assignment of assignments) {
        const resolved = resolveParams(
          { value: assignment.value },
          exprCtx,
        ).value;
        updated[assignment.field] = resolved;
      }

      return { json: updated, binary: item.binary };
    });

    return {
      description: "Set Fields",
      wouldDo: `would assign ${assignments.length} field(s)`,
      data: items,
    };
  },
};

nodeRegistry.register(definition);
