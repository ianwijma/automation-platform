import type {
  ExecutionDependencies,
  AgentDispatch,
  RunRecord,
  NodeExecutionRecord,
} from "../core/execution-engine.js";
import type { CapabilityReport } from "../core/node-contract.js";
import type { CredentialVault } from "../core/credential-vault.js";
import type { EnvResolver } from "../core/env-resolver.js";
import type { ArtifactStore } from "../api/artifacts.js";
import { AgentDispatcher } from "./dispatcher.js";
import { RemoteAgent } from "./remote-agent.js";
import type { WssHub } from "../api/wss-hub.js";

interface AgentEntry {
  agent: AgentDispatch;
  capabilities: CapabilityReport;
  online: boolean;
  tags: string[];
  name: string;
}

export class FleetDispatcher
  extends AgentDispatcher
  implements ExecutionDependencies
{
  private fleetAgents = new Map<string, AgentEntry>();
  private pendingCount = new Map<string, number>();
  private lastAgentForAutomation = new Map<string, string>();
  private hub: WssHub | null = null;

  constructor(
    hub?: WssHub,
    vault?: CredentialVault,
    envResolver?: EnvResolver,
    artifactStore?: ArtifactStore,
  ) {
    super(vault, envResolver, artifactStore);
    this.hub = hub ?? null;

    if (hub) {
      hub.onMessage((agentId, _msg) => {
        const entry = this.fleetAgents.get(agentId);
        if (entry) {
          entry.online = true;
        }
      });
    }
  }

  registerLocalCapabilities(capabilities: CapabilityReport): void {
    this.registerFleetAgent(
      this.agents.get("local")!,
      "Local machine",
      capabilities,
      ["local"],
    );
    this.db
      ?.prepare(
        "UPDATE agents SET capabilities_json=?,status='online' WHERE id='local'",
      )
      .run(JSON.stringify(capabilities));
  }

  registerRemoteAgent(
    agentId: string,
    name: string,
    capabilities: CapabilityReport,
    tags: string[] = [],
  ): void {
    let agent: AgentDispatch;

    if (this.hub) {
      agent = new RemoteAgent(agentId, this.hub);
    } else {
      agent = this.agents.get(agentId) ?? ({ agentId } as AgentDispatch);
    }

    this.agents.set(agentId, agent);

    this.fleetAgents.set(agentId, {
      agent,
      capabilities,
      online: true,
      tags,
      name,
    });

    if (!this.pendingCount.has(agentId)) this.pendingCount.set(agentId, 0);
  }

  registerFleetAgent(
    agent: AgentDispatch,
    name: string,
    capabilities: CapabilityReport,
    tags: string[] = [],
  ): void {
    this.agents.set(agent.agentId, agent);

    this.fleetAgents.set(agent.agentId, {
      agent,
      capabilities,
      online: true,
      tags,
      name,
    });

    this.pendingCount.set(agent.agentId, 0);
  }

  markAgentOnline(agentId: string): void {
    const entry = this.fleetAgents.get(agentId);
    if (entry) {
      entry.online = true;
    }
  }

  markAgentOffline(agentId: string): void {
    const entry = this.fleetAgents.get(agentId);
    if (entry) {
      entry.online = false;
    }
  }

  getAgentForTarget(
    target: { kind: string; value?: string },
    requiredCaps?: Partial<CapabilityReport>,
  ): AgentDispatch {
    if (target.kind === "local") {
      const local = this.fleetAgents.get("local");
      if (
        requiredCaps &&
        (!local || !this.capabilitiesMatch(local.capabilities, requiredCaps))
      )
        throw new Error(
          "Local desktop capabilities unavailable; check session permissions and required tools",
        );
      return this.agents.get("local")!;
    }

    if (target.kind === "machine") {
      if (!target.value || target.value === "local") {
        return this.getAgentForTarget({ kind: "local" }, requiredCaps);
      }

      const entry = this.findAgentByIdOrName(target.value);
      if (!entry) {
        throw new Error(`No agent found with ID or name: ${target.value}`);
      }
      if (
        !entry.online ||
        (this.hub &&
          target.value !== "local" &&
          !this.hub.getAgentConnection(entry.agent.agentId))
      ) {
        throw new Error(`Agent "${entry.name}" (${target.value}) is offline`);
      }
      if (
        requiredCaps &&
        !this.capabilitiesMatch(entry.capabilities, requiredCaps)
      ) {
        throw new Error(
          `Agent "${entry.name}" (${target.value}) lacks required capabilities: ${this.describeCapabilityGap(entry.capabilities, requiredCaps)}`,
        );
      }
      return entry.agent;
    }

    if (target.kind === "tag") {
      if (!target.value) {
        throw new Error("Tag target requires a value");
      }
      const candidate = this.findBestCandidate(
        (entry) => entry.tags.includes(target.value!),
        requiredCaps,
      );
      if (!candidate) {
        throw new Error(
          `No online agent with tag "${target.value}" matching required capabilities`,
        );
      }
      return candidate.agent;
    }

    if (target.kind === "any") {
      const candidate = this.findBestCandidate(() => true, requiredCaps);
      if (!candidate) {
        throw new Error("No online agent matching required capabilities");
      }
      return candidate.agent;
    }

    throw new Error(`Unknown target kind: ${target.kind}`);
  }

  private findAgentByIdOrName(value: string): AgentEntry | undefined {
    const byId = this.fleetAgents.get(value);
    if (byId) return byId;

    for (const entry of this.fleetAgents.values()) {
      if (entry.name === value) return entry;
    }
    return undefined;
  }

  private findBestCandidate(
    filter: (entry: AgentEntry) => boolean,
    requiredCaps?: Partial<CapabilityReport>,
  ): AgentEntry | null {
    const candidates: AgentEntry[] = [];

    for (const entry of this.fleetAgents.values()) {
      if (
        !entry.online ||
        (this.hub &&
          entry.agent.agentId !== "local" &&
          !this.hub.getAgentConnection(entry.agent.agentId))
      )
        continue;
      if (!filter(entry)) continue;
      if (
        requiredCaps &&
        !this.capabilitiesMatch(entry.capabilities, requiredCaps)
      )
        continue;
      candidates.push(entry);
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const busyA = this.pendingCount.get(a.agent.agentId) ?? 0;
      const busyB = this.pendingCount.get(b.agent.agentId) ?? 0;
      return busyA - busyB;
    });

    return candidates[0];
  }

  private capabilitiesMatch(
    agent: CapabilityReport,
    required: Partial<CapabilityReport>,
  ): boolean {
    if (required.os && agent.os !== required.os) return false;
    if (required.arch && agent.arch !== required.arch) return false;
    if (
      required.display &&
      agent.display !== required.display &&
      required.display !== "none"
    ) {
      if (agent.display === "none") return false;
    }
    if (required.screen === true && !agent.screen) return false;
    if (required.input && agent.input === "none" && required.input !== "none")
      return false;
    if (required.tools) {
      for (const tool of required.tools) {
        if (!agent.tools.includes(tool)) return false;
      }
    }
    if (required.gpu === true && !agent.gpu) return false;
    return true;
  }

  private describeCapabilityGap(
    agent: CapabilityReport,
    required: Partial<CapabilityReport>,
  ): string {
    const gaps: string[] = [];
    if (required.os && agent.os !== required.os)
      gaps.push(`os: need ${required.os}, have ${agent.os}`);
    if (required.arch && agent.arch !== required.arch)
      gaps.push(`arch: need ${required.arch}, have ${agent.arch}`);
    if (required.screen === true && !agent.screen)
      gaps.push("screen: required but not available");
    if (required.input && agent.input === "none" && required.input !== "none")
      gaps.push(`input: need ${required.input}, have none`);
    if (required.tools) {
      const missing = required.tools.filter((t) => !agent.tools.includes(t));
      if (missing.length > 0) gaps.push(`tools: missing ${missing.join(", ")}`);
    }
    if (required.gpu === true && !agent.gpu)
      gaps.push("gpu: required but not available");
    return gaps.join("; ");
  }

  incrementPending(agentId: string): void {
    const current = this.pendingCount.get(agentId) ?? 0;
    this.pendingCount.set(agentId, current + 1);
  }

  decrementPending(agentId: string): void {
    const current = this.pendingCount.get(agentId) ?? 0;
    this.pendingCount.set(agentId, Math.max(0, current - 1));
  }

  setLastAgentForAutomation(automationId: string, agentId: string): void {
    this.lastAgentForAutomation.set(automationId, agentId);
  }

  getLastAgentForAutomation(automationId: string): string | undefined {
    return this.lastAgentForAutomation.get(automationId);
  }

  getFleetAgents(): Array<{
    agentId: string;
    name: string;
    online: boolean;
    tags: string[];
    capabilities: CapabilityReport;
  }> {
    return [...this.fleetAgents.values()].map((entry) => ({
      agentId: entry.agent.agentId,
      name: entry.name,
      online: entry.online,
      tags: entry.tags,
      capabilities: entry.capabilities,
    }));
  }
}
