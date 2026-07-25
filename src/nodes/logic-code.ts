import type { NodeDefinition, RunContext, SimulationReport, NodeItem } from "../core/node-contract.js";
import { nodeRegistry } from "../core/node-registry.js";

interface CodeParams {
  language: string;
  code: string;
}

const definition: NodeDefinition<CodeParams> = {
  type: "logic.code",
  version: 1,
  displayName: "Code",
  category: "logic",
  sideEffecting: true,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    language: { type: "string", default: "javascript", description: "Code language" },
    code: { type: "string", description: "Code to execute" },
  },

  async run(ctx: RunContext<CodeParams>): Promise<NodeItem[]> {
    const code = ctx.params.code;

    if (!code) {
      return ctx.items;
    }

    const ctxObj = {
      items: ctx.items,
      $json: ctx.items[0]?.json ?? {},
      $env: ctx.env,
      $state: {
        get: ctx.state.get.bind(ctx.state),
        set: ctx.state.set.bind(ctx.state),
      },
    };

    const fn = new Function("ctx", code);
    const result = fn(ctxObj);

    if (!Array.isArray(result)) {
      throw new Error("Code must return an array of items");
    }

    return result.map((item: unknown) => {
      if (item && typeof item === "object" && "json" in (item as Record<string, unknown>)) {
        return item as NodeItem;
      }
      return { json: item as Record<string, unknown> };
    });
  },

  async simulate(_ctx: RunContext<CodeParams>): Promise<SimulationReport> {
    return {
      description: "Code",
      wouldDo: "would execute user code",
    };
  },
};

nodeRegistry.register(definition);
