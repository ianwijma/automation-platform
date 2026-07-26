import type { ExecutionDependencies, AgentDispatch, RunRecord, NodeExecutionRecord } from "../core/execution-engine.js";
import type { CapabilityReport } from "../core/node-contract.js";
import type { CredentialVault } from "../core/credential-vault.js";
import type { EnvResolver } from "../core/env-resolver.js";
import { LocalAgent } from "./local-agent.js";

export class AgentDispatcher implements ExecutionDependencies {
  protected agents = new Map<string, AgentDispatch>();
  private stateMap = new Map<string, unknown>();
  private runs: RunRecord[] = [];
  private nodeExecutions: NodeExecutionRecord[] = [];
  private vault: CredentialVault | null;
  private envResolver: EnvResolver | null;

  readonly now = () => new Date();

  constructor(vault?: CredentialVault, envResolver?: EnvResolver) {
    this.vault = vault ?? null;
    this.envResolver = envResolver ?? null;
    this.registerAgent(new LocalAgent());
  }

  setVault(vault: CredentialVault): void {
    this.vault = vault;
  }

  setEnvResolver(envResolver: EnvResolver): void {
    this.envResolver = envResolver;
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

  resolveEnv(agentId: string, automationId: string, _nodeType: string): Record<string, string> {
    if (!this.envResolver) return {};
    return this.envResolver.resolveForExecution(agentId, automationId);
  }

  resolveSecrets(_agentId: string, credentialRefs: Record<string, unknown>): Record<string, string> {
    if (!this.vault) return {};
    const result: Record<string, string> = {};
    const refs = credentialRefs as { type?: string; name?: string };
    if (refs.type && refs.name) {
      try {
        const cred = this.vault.getCredentialByName(refs.name);
        if (cred) {
          for (const [k, v] of Object.entries(cred.values)) {
            result[k] = v;
          }
        }
      } catch {
        // credential not found, skip
      }
    }
    return result;
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

  getRun(runId: string): RunRecord | undefined {
    return this.runs.find((r) => r.id === runId);
  }

  getAllRuns(): RunRecord[] {
    return [...this.runs];
  }

  updateNodeExecution(id: string, updates: Partial<NodeExecutionRecord>): void {
    const idx = this.nodeExecutions.findIndex((r) => r.id === id);
    if (idx >= 0) {
      Object.assign(this.nodeExecutions[idx], updates);
    }
  }
}
