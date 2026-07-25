import type { ExecutionDependencies, AgentDispatch, RunRecord, NodeExecutionRecord } from "../core/execution-engine.js";
import type { CapabilityReport } from "../core/node-contract.js";
import { LocalAgent } from "./local-agent.js";

export class AgentDispatcher implements ExecutionDependencies {
  private agents = new Map<string, AgentDispatch>();
  private stateMap = new Map<string, unknown>();
  private runs: RunRecord[] = [];
  private nodeExecutions: NodeExecutionRecord[] = [];

  readonly now = () => new Date();

  constructor() {
    this.registerAgent(new LocalAgent());
  }

  registerAgent(agent: AgentDispatch): void {
    this.agents.set(agent.agentId, agent);
  }

  getAgentForTarget(
    target: { kind: string; value?: string },
    _requiredCaps?: Partial<CapabilityReport>,
  ): AgentDispatch {
    const local = this.agents.get("local")!;

    if (target.kind === "local") {
      return local;
    }

    if (target.kind === "machine") {
      if (!target.value || target.value === "local" || target.value === local.agentId) {
        return local;
      }
      throw new Error(`Remote agents not yet supported (target: ${target.value})`);
    }

    if (target.kind === "tag" || target.kind === "any") {
      return local;
    }

    throw new Error(`Unknown target kind: ${target.kind}`);
  }

  resolveEnv(_agentId: string, _automationId: string, _nodeType: string): Record<string, string> {
    return {};
  }

  resolveSecrets(_agentId: string, _credentialRefs: Record<string, unknown>): Record<string, string> {
    return {};
  }

  getState(automationId: string, key: string): unknown {
    return this.stateMap.get(`${automationId}:${key}`);
  }

  setState(automationId: string, key: string, value: unknown): void {
    this.stateMap.set(`${automationId}:${key}`, value);
  }

  saveRun(record: RunRecord): void {
    const idx = this.runs.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      this.runs[idx] = record;
    } else {
      this.runs.push(record);
    }
  }

  saveNodeExecution(record: NodeExecutionRecord): void {
    this.nodeExecutions.push(record);
  }

  updateNodeExecution(id: string, updates: Partial<NodeExecutionRecord>): void {
    const idx = this.nodeExecutions.findIndex((r) => r.id === id);
    if (idx >= 0) {
      Object.assign(this.nodeExecutions[idx], updates);
    }
  }
}
