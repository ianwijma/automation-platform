import type { AgentDispatch, StateAccess } from "../core/execution-engine.js";
import type { NodeDefinition, NodeItem } from "../core/node-contract.js";
import type { AgentDispatchMessage } from "../core/agent-protocol.js";
import type { WssHub } from "../api/wss-hub.js";

export class RemoteAgent implements AgentDispatch {
  agentId: string;
  private hub: WssHub;

  constructor(agentId: string, hub: WssHub) {
    this.agentId = agentId;
    this.hub = hub;
  }

  async send(
    nodeExecId: string,
    _node: NodeDefinition,
    params: Record<string, unknown>,
    items: NodeItem[],
    secrets: Record<string, string>,
    env: Record<string, string>,
    dryRun: boolean,
    timeoutSec: number,
    _state: StateAccess,
    runId: string,
    _automationId: string,
  ): Promise<{ items: NodeItem[]; durationMs: number; error?: string }> {
    const dispatchMsg: AgentDispatchMessage = {
      type: "dispatch",
      nodeExecutionId: nodeExecId,
      nodeId: _node.type,
      nodeType: _node.type,
      params,
      items,
      secrets,
      env,
      runId,
      dryRun,
      timeoutSec,
    };

    try {
      const result = await this.hub.dispatchToAgent(this.agentId, dispatchMsg, timeoutSec);
      return {
        items: result.items ?? [],
        durationMs: result.durationMs,
        error: result.error,
      };
    } catch (err: any) {
      return {
        items: [],
        durationMs: 0,
        error: err?.message ?? String(err),
      };
    }
  }

  isOnline(): boolean {
    return this.hub.getAgentConnection(this.agentId) !== undefined;
  }
}
