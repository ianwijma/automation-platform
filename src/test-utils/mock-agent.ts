import type { AgentDispatch, StateAccess } from "../core/execution-engine.js";
import type { NodeDefinition, NodeItem, CapabilityReport } from "../core/node-contract.js";

export class MockAgent implements AgentDispatch {
  agentId: string;
  capabilities: CapabilityReport;
  tags: string[];
  online = true;
  dispatchLog: Array<{ nodeType: string; params: Record<string, unknown> }> = [];

  private behavior: "success" | "error" | "timeout" = "success";
  private customResponse: NodeItem[] | null = null;

  constructor(agentId: string, capabilities: CapabilityReport, tags?: string[]) {
    this.agentId = agentId;
    this.capabilities = capabilities;
    this.tags = tags ?? [];
  }

  setBehavior(behavior: "success" | "error" | "timeout"): void {
    this.behavior = behavior;
  }

  setCustomResponse(items: NodeItem[]): void {
    this.customResponse = items;
  }

  goOffline(): void {
    this.online = false;
  }

  goOnline(): void {
    this.online = true;
  }

  async send(
    nodeExecId: string,
    node: NodeDefinition,
    params: Record<string, unknown>,
    items: NodeItem[],
    secrets: Record<string, string>,
    env: Record<string, string>,
    dryRun: boolean,
    timeoutSec: number,
    state: StateAccess,
    runId: string,
    automationId: string,
  ): Promise<{ items: NodeItem[]; durationMs: number; error?: string }> {
    this.dispatchLog.push({ nodeType: node.type, params });

    if (!this.online) {
      return { items: [], durationMs: 0, error: "Agent offline" };
    }

    const start = Date.now();

    if (this.behavior === "timeout") {
      await new Promise((resolve) => setTimeout(resolve, (timeoutSec + 1) * 1000));
      return { items: [], durationMs: Date.now() - start, error: "Agent timed out" };
    }

    if (this.behavior === "error") {
      return { items: [], durationMs: Date.now() - start, error: "Mock agent error" };
    }

    if (this.customResponse) {
      return { items: this.customResponse, durationMs: Date.now() - start };
    }

    const defaultItems: NodeItem[] = items.length > 0
      ? [{ json: { ...items[0].json, processedBy: this.agentId } }]
      : [{ json: { result: "mock", processedBy: this.agentId } }];

    return { items: defaultItems, durationMs: Date.now() - start };
  }
}
