import type { AgentDispatch, StateAccess } from "../core/execution-engine.js";
import type { NodeDefinition, NodeItem, RunContext, ArtifactStoreHandle as ArtifactStoreHandleType } from "../core/node-contract.js";
import type { ArtifactStore } from "../api/artifacts.js";
import { ArtifactStoreHandle } from "../core/artifact-handle.js";

export class LocalAgent implements AgentDispatch {
  agentId = "local";
  private artifactStore?: ArtifactStore;

  constructor(artifactStore?: ArtifactStore) {
    this.artifactStore = artifactStore;
  }

  setArtifactStore(store: ArtifactStore): void {
    this.artifactStore = store;
  }

  async send(
    _nodeExecId: string,
    node: NodeDefinition,
    params: Record<string, unknown>,
    items: NodeItem[],
    secrets: Record<string, string>,
    env: Record<string, string>,
    dryRun: boolean,
    _timeoutSec: number,
    state: StateAccess,
    runId: string,
    _automationId: string,
  ): Promise<{ items: NodeItem[]; durationMs: number; error?: string }> {
    const ctx: RunContext = {
      nodeId: _nodeExecId,
      nodeName: node.displayName,
      params,
      items,
      env,
      secrets,
      state,
      now: new Date(),
      agentId: this.agentId,
      runId,
      dryRun,
    };

    if (this.artifactStore) {
      ctx.artifacts = new ArtifactStoreHandle(this.artifactStore, runId);
    }

    const start = Date.now();

    try {
      if (dryRun && node.simulate) {
        const report = await node.simulate(ctx);
        const durationMs = Date.now() - start;
        return { items: report.data ?? [], durationMs };
      }

      const result = await node.run(ctx);
      const durationMs = Date.now() - start;
      return { items: result, durationMs };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      return { items: [], durationMs, error: err?.message ?? String(err) };
    }
  }
}
