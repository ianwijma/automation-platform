import { evaluateSandbox } from "../core/sandbox.js";
import { itemSchema } from "../core/schemas.js";
import type {
  NodeDefinition,
  RunContext,
  SimulationReport,
  NodeItem,
} from "../core/node-contract.js";
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
  sideEffecting: false,
  inputs: [{ name: "in", type: "item" }],
  outputs: [{ name: "out", type: "item" }],
  paramsSchema: {
    language: {
      type: "string",
      default: "javascript",
      description: "Code language",
    },
    code: { type: "string", description: "Code to execute" },
  },

  async run(ctx: RunContext<CodeParams>): Promise<NodeItem[]> {
    const code = ctx.params.code;

    if (!code) {
      return ctx.items;
    }

    const source =
      ctx.params.language === "typescript"
        ? new Bun.Transpiler({ loader: "ts" }).transformSync(
            `function execute(ctx: any) { ${code} }`,
          )
        : `function execute(ctx) { ${code} }`;
    const result = evaluateSandbox(
      `const writes={}; ctx.$state={get:key=>ctx.state[key],set:(key,value)=>{writes[key]=value;ctx.state[key]=value;}}; ${source}; const items=execute(ctx); ({items,writes});`,
      {
        state: ctx.stateSnapshot ?? {},
        items: ctx.items,
        $json: ctx.items[0]?.json ?? {},
        $env: ctx.env,
      },
      1000,
      ctx.signal,
    ) as { items: unknown; writes: Record<string, unknown> };
    if (!Array.isArray(result.items))
      throw new Error(
        "Code must return an array of items (async code is not supported)",
      );
    const items = result.items.map((item) =>
      itemSchema.parse(
        item && typeof item === "object" && "json" in item
          ? item
          : { json: item },
      ),
    );
    for (const [key, value] of Object.entries(result.writes))
      ctx.state.set(key, value);
    return items;
  },

  async simulate(_ctx: RunContext<CodeParams>): Promise<SimulationReport> {
    return {
      description: "Code",
      wouldDo: "would execute user code",
    };
  },
};

nodeRegistry.register(definition);
