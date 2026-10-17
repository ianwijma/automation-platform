import { createHash } from "node:crypto";
import type {
  AgentDispatch,
  StateAccess,
  DispatchContext,
} from "../core/execution-engine.js";
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
    context?: DispatchContext,
  ): ReturnType<AgentDispatch["send"]> {
    const artifactData: Record<string, string> = {};
    const collect = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if ("$artifact" in value && typeof value.$artifact === "string") {
        const artifact = this.hub.artifactStore?.getArtifact(value.$artifact);
        if (!artifact)
          throw new Error(`Artifact unavailable: ${value.$artifact}`);
        artifactData[value.$artifact] = artifact.data.toString("base64");
      } else for (const child of Object.values(value)) collect(child);
    };
    collect(items);
    collect(params);
    const dispatchMsg: AgentDispatchMessage = {
      type: "dispatch",
      nodeExecutionId: nodeExecId,
      protocolVersion: 2,
      automationId: _automationId,
      nodeVersion: _node.version,
      nodeId: context?.nodeId ?? _node.type,
      actionTarget: context?.actionTarget,
      inputs: context?.inputs,
      state: context?.stateSnapshot ?? {},
      artifactData,
      nodeType: _node.type,
      params,
      items,
      secrets,
      env,
      runId,
      dryRun,
      timeoutSec,
    };

    const cancel = () =>
      this.hub.broadcastToAgent(this.agentId, {
        type: "cancel",
        nodeExecutionId: nodeExecId,
      });
    context?.signal.addEventListener("abort", cancel, { once: true });
    try {
      context?.signal.throwIfAborted();
      const result = await this.hub.dispatchToAgent(
        this.agentId,
        dispatchMsg,
        timeoutSec,
      );
      context?.signal.throwIfAborted();
      if (result.status === "success") {
        for (const artifact of result.artifacts ?? []) {
          if (!artifact.data) throw new Error("Missing artifact data");
          const bytes = Buffer.from(artifact.data, "base64");
          if (createHash("sha256").update(bytes).digest("hex") !== artifact.id)
            throw new Error("Artifact checksum mismatch");
          if (!this.hub.artifactStore)
            throw new Error("Artifact store unavailable");
          this.hub.artifactStore.storeArtifact(
            bytes,
            artifact.mime,
            artifact.name,
            runId,
          );
        }
        for (const [key, value] of Object.entries(result.stateWrites ?? {}))
          _state.set(key, value);
      }
      return {
        items: result.items ?? [],
        durationMs: result.durationMs,
        error:
          result.status === "success"
            ? undefined
            : (result.error ?? result.status),
        simulation: result.simulation,
      };
    } catch (err: any) {
      return {
        items: [],
        durationMs: 0,
        error: err?.message ?? String(err),
      };
    } finally {
      context?.signal.removeEventListener("abort", cancel);
    }
  }

  isOnline(): boolean {
    return this.hub.getAgentConnection(this.agentId) !== undefined;
  }
}
