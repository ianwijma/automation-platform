import type { RunContext, NodeItem } from "../core/node-contract.js";

export function createTestRunContext(
  params: Record<string, unknown>,
  items: NodeItem[] = [],
  overrides?: Partial<RunContext>,
): RunContext {
  return {
    nodeId: "test-node",
    nodeName: "Test Node",
    params: params as unknown as RunContext["params"],
    items,
    env: {},
    secrets: {},
    state: {
      get: () => undefined,
      set: () => {},
    },
    now: new Date(),
    agentId: "local",
    runId: "test-run",
    dryRun: false,
    ...overrides,
  };
}
