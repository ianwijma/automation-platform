import type {
  AutomationDefinition,
  AutomationNode,
  ActionTarget,
} from "./types.js";
import type {
  NodeItem,
  NodeDefinition,
  SimulationReport,
  CapabilityReport,
} from "./node-contract.js";
import { nodeRegistry } from "./node-registry.js";
import { resolveParams } from "./expressions.js";
import {
  validateDefinition,
  topologicalOrder,
  itemSchema,
  actionTargetSchema,
} from "./schemas.js";
import { abortable, delay } from "./cancellation.js";
import { redactSecrets } from "./redaction.js";
import { randomUUID } from "node:crypto";

export interface DispatchContext {
  artifacts?: import("./node-contract.js").ArtifactStoreHandle;
  nodeId: string;
  stateSnapshot?: Record<string, unknown>;
  nodeName: string;
  actionTarget?: ActionTarget;
  inputs: Record<string, NodeItem[]>;
  signal: AbortSignal;
}
export interface RunOptions {
  mode: "manual" | "trigger" | "dry" | "partial";
  runId?: string;
  triggerNodeId?: string;
  inputData?: NodeItem[];
  signal?: AbortSignal;
  dryRun?: boolean;
  fromNodeId?: string;
  nodeScope?: "from" | "to" | "single";
  pinData?: Record<string, NodeItem[]>;
  triggerData?: NodeItem[];
}

export interface NodeExecutionRecord {
  payloadArtifact?: {
    $artifact: string;
    mime: string;
    size: number;
    name: string;
  };
  id: string;
  runId: string;
  nodeId: string;
  agentId: string;
  status:
    | "success"
    | "error"
    | "timeout"
    | "cancelled"
    | "interrupted"
    | "running";
  attempt: number;
  simulated: boolean;
  input: NodeItem[] | null;
  output: NodeItem[] | null;
  outputs?: Record<string, NodeItem[]>;
  simulation?: SimulationReport;
  pinned: boolean;
  startedAt: string;
  durationMs: number;
  error: string | null;
}

export interface RunRecord {
  errorHandlerRunId?: string;
  errorHandlerError?: string;
  id: string;
  automationId: string;
  versionId: string;
  mode: string;
  status:
    | "queued"
    | "running"
    | "success"
    | "error"
    | "interrupted"
    | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  nodeExecutions: NodeExecutionRecord[];
  definition?: AutomationDefinition;
  dryRun?: boolean;
}

export interface StateAccess {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

export interface AgentDispatch {
  agentId: string;
  send(
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
    context?: DispatchContext,
  ): Promise<{
    items: NodeItem[];
    outputs?: Record<string, NodeItem[]>;
    simulation?: SimulationReport;
    durationMs: number;
    error?: string;
  }>;
}

export interface ExecutionDependencies {
  incrementPending?(agentId: string): void;
  decrementPending?(agentId: string): void;
  resolveEnv(
    agentId: string,
    automationId: string,
    nodeType: string,
  ): Record<string, string>;
  resolveSecrets(
    agentId: string,
    credentialRefs: Record<string, unknown>,
  ): Record<string, string>;
  getState(automationId: string, key: string): unknown;
  setState(automationId: string, key: string, value: unknown): void;
  getAgentForTarget(
    target: { kind: string; value?: string },
    requiredCaps?: Partial<CapabilityReport>,
  ): AgentDispatch;
  saveRun(record: RunRecord): void;
  saveNodeExecution(record: NodeExecutionRecord): void;
  updateNodeExecution(id: string, updates: Partial<NodeExecutionRecord>): void;
  now: () => Date;
  registerRunControl?(id: string, controller: AbortController): void;
  releaseRunControl?(id: string): void;
  sensitiveEnvValues?(agentId: string, automationId: string): string[];
  resolveAiSecrets?(): Record<string, string>;
  getStateSnapshot?(automationId: string): Record<string, unknown>;
}

export function routeOutputs(
  node: Pick<AutomationNode, "type" | "typeVersion" | "params">,
  items: NodeItem[],
): Record<string, NodeItem[]> {
  const outputs: Record<string, NodeItem[]> = {};
  for (const item of items) {
    itemSchema.parse(item);
    const port =
      ["logic.if", "logic.switch", "system.command", "error.throw"].includes(
        node.type,
      ) && typeof item.json._branch === "string"
        ? item.json._branch
        : "out";
    (outputs[port] ??= []).push(item);
  }
  return outputs;
}
function reachable(
  def: AutomationDefinition,
  seeds: string[],
  reverse = false,
): Set<string> {
  const visited = new Set<string>(),
    queue = [...seeds];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of def.edges) {
      if (edge.targetPort === "continue") continue;
      if ((reverse ? edge.target : edge.source) === id)
        queue.push(reverse ? edge.source : edge.target);
    }
  }
  return visited;
}

export class ExecutionEngine {
  constructor(private deps: ExecutionDependencies) {}
  async execute(
    raw: AutomationDefinition,
    automationId: string,
    versionId: string,
    options: RunOptions,
  ): Promise<RunRecord> {
    const run: RunRecord = {
      id: options.runId ?? randomUUID(),
      automationId,
      versionId,
      mode: options.mode,
      status: "running",
      startedAt: this.deps.now().toISOString(),
      finishedAt: null,
      error: null,
      nodeExecutions: [],
      definition: structuredClone(raw),
    };
    const controller = new AbortController();
    const externalAbort = () =>
      controller.abort(options.signal?.reason ?? new Error("Cancelled"));
    options.signal?.addEventListener("abort", externalAbort, { once: true });
    if (options.signal?.aborted) externalAbort();
    const sensitive = new Set<string>();
    const safe = <T>(value: T): T => redactSecrets(value, sensitive);
    const persistRun = () => this.deps.saveRun(safe(run));
    this.deps.registerRunControl?.(run.id, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dryRun = options.dryRun === true || options.mode === "dry";
    run.dryRun = dryRun;
    const dryState = new Map<string, unknown>();
    const state: StateAccess = {
      get: (key) =>
        dryState.has(key)
          ? dryState.get(key)
          : this.deps.getState(automationId, key),
      set: (key, value) => {
        controller.signal.throwIfAborted();
        if (dryRun) dryState.set(key, value);
        else this.deps.setState(automationId, key, value);
      },
    };
    try {
      persistRun();
      const def = validateDefinition(raw),
        order = topologicalOrder(def);
      timer = setTimeout(
        () => controller.abort(new Error("Run timed out")),
        def.settings.runTimeoutSec * 1000,
      );
      const nodes = new Map(def.nodes.map((n) => [n.id, n]));
      const pins = options.mode === "trigger" ? {} : (options.pinData ?? {});
      const outputs = new Map<string, Record<string, NodeItem[]>>();
      for (const [id, items] of Object.entries(pins))
        if (nodes.has(id)) outputs.set(id, routeOutputs(nodes.get(id)!, items));
      let roots: string[];
      if (options.triggerNodeId) {
        if (!nodes.get(options.triggerNodeId)?.type.startsWith("trigger."))
          throw new Error("Unknown trigger node");
        roots = [options.triggerNodeId];
      } else {
        const triggers = def.nodes.filter(
          (n) => n.type.startsWith("trigger.") && !n.disabled,
        );
        const manual = triggers.filter((n) => n.type === "trigger.manual");
        if (triggers.length > 1 && manual.length !== 1 && !options.fromNodeId)
          throw new Error("Select a trigger when multiple triggers exist");
        roots = (manual.length ? manual : triggers.slice(0, 1)).map(
          (n) => n.id,
        );
        if (!roots.length && !options.fromNodeId && def.nodes.length)
          throw new Error("Automation requires a trigger");
      }
      let selected = reachable(def, roots);
      if (options.fromNodeId) {
        if (!nodes.has(options.fromNodeId))
          throw new Error("Unknown execution node");
        selected =
          options.nodeScope === "single"
            ? new Set([options.fromNodeId])
            : reachable(def, [options.fromNodeId], options.nodeScope === "to");
      }
      const inputsFor = (id: string) => {
        const inputs: Record<string, NodeItem[]> = {};
        for (const edge of def.edges.filter(
          (e) => e.target === id && e.targetPort !== "continue",
        ))
          (inputs[edge.targetPort] ??= []).push(
            ...(outputs.get(edge.source)?.[edge.sourcePort] ?? []),
          );
        return inputs;
      };
      const save = (record: NodeExecutionRecord) => {
        run.nodeExecutions.push(record);
        this.deps.saveNodeExecution(safe(record));
        persistRun();
      };
      const loopBodies = new Map<string, Set<string>>();
      for (const loop of def.nodes.filter((n) => n.type === "logic.loop")) {
        const bodyRoots = def.edges
          .filter((e) => e.source === loop.id && e.sourcePort === "out")
          .map((e) => e.target);
        const body = reachable(def, bodyRoots);
        if (body.has(loop.id))
          throw new Error("Loop body must return through continue");
        const done = reachable(
          def,
          def.edges
            .filter((e) => e.source === loop.id && e.sourcePort === "done")
            .map((e) => e.target),
        );
        if ([...body].some((id) => done.has(id)))
          throw new Error("Loop body and done path must be separate");
        for (const edge of def.edges.filter(
          (e) => body.has(e.target) && !body.has(e.source),
        )) {
          if (edge.source !== loop.id || edge.sourcePort !== "out")
            throw new Error("Loop body cannot have external inputs");
        }
        if (
          body.size &&
          !def.edges.some(
            (e) =>
              body.has(e.source) &&
              e.target === loop.id &&
              e.targetPort === "continue",
          )
        )
          throw new Error("Loop body requires a continue edge");
        loopBodies.set(loop.id, body);
      }
      const executeOrder = async (scope: Set<string>) => {
        const handled = new Set<string>();
        for (const id of order) {
          if (!scope.has(id) || handled.has(id)) continue;
          controller.signal.throwIfAborted();
          const node = nodes.get(id)!,
            spec = nodeRegistry.lookup(node.type, node.typeVersion)!;
          const inputs = inputsFor(id);
          let items = Object.values(inputs).flat();
          const isRoot = roots.includes(id);
          if (isRoot) items = options.triggerData ?? [];
          if (id === options.fromNodeId && options.inputData)
            items = options.inputData;
          if (
            node.disabled ||
            (!isRoot &&
              !items.length &&
              !pins[id] &&
              !(
                id === options.fromNodeId &&
                (options.inputData !== undefined ||
                  def.edges.every((e) => e.target !== id))
              ))
          ) {
            outputs.set(id, {});
            continue;
          }
          const startedAt = this.deps.now().toISOString();
          if (pins[id]) {
            outputs.set(id, routeOutputs(node, pins[id]));
            save({
              id: randomUUID(),
              runId: run.id,
              nodeId: id,
              agentId: "local",
              status: "success",
              attempt: 0,
              simulated: false,
              pinned: true,
              input: def.settings.savePayloads ? items : null,
              output: def.settings.savePayloads ? pins[id] : null,
              startedAt,
              durationMs: 0,
              error: null,
            });
            continue;
          }
          if (node.type === "logic.loop") {
            const batchSize = Number(node.params.batchSize ?? 1),
              body = loopBodies.get(id)!;
            for (const child of body) handled.add(child);
            const done: NodeItem[] = [];
            for (let offset = 0; offset < items.length; offset += batchSize) {
              for (const child of body) outputs.delete(child);
              const batch = items.slice(offset, offset + batchSize);
              outputs.set(id, { out: batch });
              await executeOrder(body);
              const continued = def.edges
                .filter((e) => e.target === id && e.targetPort === "continue")
                .flatMap((e) => outputs.get(e.source)?.[e.sourcePort] ?? []);
              done.push(...(body.size ? continued : batch));
            }
            outputs.set(id, { done });
            save({
              id: randomUUID(),
              runId: run.id,
              nodeId: id,
              agentId: "local",
              status: "success",
              attempt: 0,
              simulated: false,
              pinned: false,
              input: def.settings.savePayloads ? items : null,
              output: def.settings.savePayloads ? done : null,
              outputs: def.settings.savePayloads ? { done } : undefined,
              startedAt,
              durationMs: Date.now() - Date.parse(startedAt),
              error: null,
            });
            continue;
          }
          const retry = node.retry ?? { attempts: 1, backoffSec: [] };
          let succeeded = false,
            lastError: unknown;
          for (let attempt = 0; attempt < retry.attempts; attempt++) {
            const executionId = randomUUID(),
              start = Date.now();
            const record: NodeExecutionRecord = {
              id: executionId,
              runId: run.id,
              nodeId: id,
              agentId: "local",
              status: "running",
              attempt,
              simulated: dryRun && spec.sideEffecting,
              input: def.settings.savePayloads ? items : null,
              output: null,
              pinned: false,
              startedAt: this.deps.now().toISOString(),
              durationMs: 0,
              error: null,
            };
            const nodeController = new AbortController();
            const abort = () => nodeController.abort(controller.signal.reason);
            controller.signal.addEventListener("abort", abort, { once: true });
            const deadline = setTimeout(
              () => nodeController.abort(new Error("Node timed out")),
              (node.timeoutSec ?? 300) * 1000,
            );
            save(record);
            try {
              const agent = this.deps.getAgentForTarget(
                node.type === "vision.llm" ? { kind: "local" } : node.target,
                spec.requiredCapabilities,
              );
              record.agentId = agent.agentId;
              const env = this.deps.resolveEnv(
                agent.agentId,
                automationId,
                node.type,
              );
              const secrets =
                node.type === "vision.llm" && !node.credentials
                  ? (this.deps.resolveAiSecrets?.() ?? {})
                  : this.deps.resolveSecrets(
                      agent.agentId,
                      node.credentials ?? {},
                    );
              for (const value of [
                ...Object.values(secrets),
                ...(this.deps.sensitiveEnvValues?.(
                  agent.agentId,
                  automationId,
                ) ?? []),
              ])
                if (value) sensitive.add(value);
              const defaults = Object.fromEntries(
                Object.entries(spec.paramsSchema)
                  .filter(
                    ([, v]) => v && typeof v === "object" && "default" in v,
                  )
                  .map(([k, v]) => [k, (v as { default: unknown }).default]),
              );
              const rawParams = { ...defaults, ...node.params };
              const delayed = new Set(
                node.type === "logic.set"
                  ? ["assignments"]
                  : node.type === "logic.code"
                    ? ["code"]
                    : node.type === "logic.switch"
                      ? ["rules"]
                      : node.type === "logic.if"
                        ? ["condition"]
                        : node.type === "state.set"
                          ? ["valueExpression"]
                          : [],
              );
              const params = resolveParams(
                Object.fromEntries(
                  Object.entries(rawParams).filter(
                    ([key]) => !delayed.has(key),
                  ),
                ),
                {
                  json: items[0]?.json ?? {},
                  items,
                  node: { id, name: node.name },
                  env,
                  state: {
                    ...this.deps.getStateSnapshot?.(automationId),
                    ...Object.fromEntries(dryState),
                  },
                  now: this.deps.now(),
                },
              );
              for (const key of delayed)
                if (key in rawParams) params[key] = rawParams[key];
              const actionTarget = node.actionTarget
                ? actionTargetSchema.parse(
                    resolveParams(
                      node.actionTarget as unknown as Record<string, unknown>,
                      {
                        json: items[0]?.json ?? {},
                        items,
                        node: { id, name: node.name },
                        env,
                        state: {
                          ...this.deps.getStateSnapshot?.(automationId),
                          ...Object.fromEntries(dryState),
                        },
                        now: this.deps.now(),
                      },
                    ),
                  )
                : undefined;
              this.deps.incrementPending?.(agent.agentId);
              const result = await abortable(
                agent.send(
                  executionId,
                  spec,
                  params,
                  items,
                  secrets,
                  env,
                  dryRun,
                  node.timeoutSec ?? 300,
                  state,
                  run.id,
                  automationId,
                  {
                    nodeId: id,
                    nodeName: node.name,
                    stateSnapshot: {
                      ...this.deps.getStateSnapshot?.(automationId),
                      ...Object.fromEntries(dryState),
                    },
                    actionTarget,
                    inputs,
                    signal: nodeController.signal,
                  },
                ),
                nodeController.signal,
              ).finally(() => this.deps.decrementPending?.(agent.agentId));
              if (Date.now() - start >= (node.timeoutSec ?? 300) * 1000)
                nodeController.abort(new Error("Node timed out"));
              nodeController.signal.throwIfAborted();
              if (result.error) throw new Error(result.error);
              if (
                result.items.length > 10000 ||
                Buffer.byteLength(JSON.stringify(result.items)) >
                  16 * 1024 * 1024
              )
                throw new Error(
                  "Node output exceeds limits (10,000 items / 16 MiB); use artifacts",
                );
              const routed = result.outputs ?? routeOutputs(node, result.items);
              if (
                routed.error?.length &&
                !def.edges.some(
                  (e) => e.source === id && e.sourcePort === "error",
                )
              )
                throw new Error(
                  String(
                    routed.error[0].json.error ??
                      routed.error[0].json.stderr ??
                      "Node returned an error",
                  ),
                );
              outputs.set(id, routed);
              record.status = "success";
              record.output = def.settings.savePayloads ? result.items : null;
              record.outputs = def.settings.savePayloads ? routed : undefined;
              record.simulation = result.simulation;
              succeeded = true;
            } catch (error) {
              lastError = error;
              record.error =
                error instanceof Error ? error.message : String(error);
              record.status = record.error.includes("outcome is uncertain")
                ? "interrupted"
                : controller.signal.aborted &&
                    !record.error.includes("timed out")
                  ? "cancelled"
                  : nodeController.signal.aborted
                    ? "timeout"
                    : "error";
            } finally {
              clearTimeout(deadline);
              controller.signal.removeEventListener("abort", abort);
              record.durationMs = Date.now() - start;
              this.deps.updateNodeExecution(record.id, safe(record));
              persistRun();
            }
            if (
              succeeded ||
              nodeController.signal.aborted ||
              record.status === "interrupted"
            )
              break;
            if (attempt + 1 < retry.attempts)
              await delay(
                (retry.backoffSec[
                  Math.min(attempt, retry.backoffSec.length - 1)
                ] ?? 0) * 1000,
                controller.signal,
              );
          }
          controller.signal.throwIfAborted();
          if (!succeeded) {
            if (
              def.edges.some((e) => e.source === id && e.sourcePort === "error")
            )
              outputs.set(id, {
                error: [
                  {
                    json: {
                      error:
                        lastError instanceof Error
                          ? lastError.message
                          : String(lastError),
                      nodeId: id,
                    },
                  },
                ],
              });
            else throw lastError;
          }
        }
      };
      await executeOrder(selected);
      controller.signal.throwIfAborted();
      run.status = "success";
    } catch (error) {
      run.error = error instanceof Error ? error.message : String(error);
      run.status = run.error.includes("outcome is uncertain")
        ? "interrupted"
        : controller.signal.aborted && !run.error.includes("timed out")
          ? "cancelled"
          : "error";
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", externalAbort);
      run.finishedAt = this.deps.now().toISOString();
      try {
        persistRun();
      } finally {
        this.deps.releaseRunControl?.(run.id);
      }
    }
    return safe(run);
  }
}
