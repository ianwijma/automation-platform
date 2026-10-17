import type {
  AgentDispatch,
  StateAccess,
  DispatchContext,
} from "../core/execution-engine.js";
import type {
  NodeDefinition,
  NodeItem,
  RunContext,
} from "../core/node-contract.js";
import type { ArtifactStore } from "../api/artifacts.js";
import { ArtifactStoreHandle } from "../core/artifact-handle.js";
import { abortable, executionSignal } from "../core/cancellation.js";

export class LocalAgent implements AgentDispatch {
  agentId = "local";
  constructor(private artifactStore?: ArtifactStore) {}
  setArtifactStore(store: ArtifactStore): void {
    this.artifactStore = store;
  }
  async send(
    executionId: string,
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
    context?: DispatchContext,
  ): ReturnType<AgentDispatch["send"]> {
    const controller = new AbortController();
    const abort = () => controller.abort(context?.signal.reason);
    context?.signal.addEventListener("abort", abort, { once: true });
    if (context?.signal.aborted) abort();
    const timer = setTimeout(
      () => controller.abort(new Error("Node timed out")),
      timeoutSec * 1000,
    );
    const deadline = Date.now() + timeoutSec * 1000;
    const ctx: RunContext = {
      nodeId: context?.nodeId ?? executionId,
      nodeName: context?.nodeName ?? node.displayName,
      executionId,
      automationId,
      params,
      items,
      env,
      secrets,
      state: {
        get: state.get,
        set: (key, value) => {
          if (Date.now() >= deadline)
            controller.abort(new Error("Node timed out"));
          controller.signal.throwIfAborted();
          state.set(key, value);
        },
      },
      now: new Date(),
      agentId: this.agentId,
      runId,
      dryRun,
      signal: controller.signal,
      stateSnapshot: context?.stateSnapshot,
      inputs: context?.inputs,
      actionTarget: context?.actionTarget,
      artifacts:
        context?.artifacts ??
        (this.artifactStore
          ? new ArtifactStoreHandle(this.artifactStore, runId)
          : undefined),
    };
    const start = Date.now();
    try {
      return await executionSignal.run(controller.signal, async () => {
        controller.signal.throwIfAborted();
        if (dryRun && node.sideEffecting) {
          if (!node.simulate)
            throw new Error(
              `Dry run unavailable: ${node.type} has no simulator`,
            );
          const simulation = await abortable(
            node.simulate(ctx),
            controller.signal,
          );
          return {
            items: simulation.data ?? items,
            simulation,
            durationMs: Date.now() - start,
          };
        }
        const result = await abortable(node.run(ctx), controller.signal);
        return { items: result, durationMs: Date.now() - start };
      });
    } catch (error) {
      return {
        items: [],
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
      context?.signal.removeEventListener("abort", abort);
    }
  }
}
