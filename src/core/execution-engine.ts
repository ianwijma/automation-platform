import type { AutomationDefinition, AutomationNode, AutomationEdge, AutomationSettings } from "../core/types.js";
import type { NodeItem, NodeDefinition, RunContext, SimulationReport, CapabilityReport } from "../core/node-contract.js";
import { nodeRegistry } from "./node-registry.js";
import { createExpressionEvaluator, resolveParams } from "./expressions.js";
import type { ExpressionContext } from "../core/expression-contract.js";
import { randomUUID } from "node:crypto";

export interface RunOptions {
  mode: "manual" | "trigger" | "dry" | "partial";
  dryRun?: boolean;
  fromNodeId?: string;
  pinData?: Record<string, NodeItem[]>;
  triggerData?: NodeItem[];
}

export interface NodeExecutionRecord {
  id: string;
  runId: string;
  nodeId: string;
  agentId: string;
  status: "success" | "error" | "timeout" | "cancelled" | "interrupted" | "running";
  attempt: number;
  simulated: boolean;
  input: NodeItem[] | null;
  output: NodeItem[] | null;
  pinned: boolean;
  startedAt: string;
  durationMs: number;
  error: string | null;
}

export interface RunRecord {
  id: string;
  automationId: string;
  versionId: string;
  mode: string;
  status: "queued" | "running" | "success" | "error" | "interrupted" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  nodeExecutions: NodeExecutionRecord[];
}

export interface StateAccess {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
}

export interface AgentDispatch {
  agentId: string;
  send(nodeExecId: string, node: NodeDefinition, params: Record<string, unknown>, items: NodeItem[], secrets: Record<string, string>, env: Record<string, string>, dryRun: boolean, timeoutSec: number, state: StateAccess, runId: string, automationId: string): Promise<{ items: NodeItem[]; durationMs: number; error?: string }>;
}

export interface ExecutionDependencies {
  resolveEnv(agentId: string, automationId: string, nodeType: string): Record<string, string>;
  resolveSecrets(agentId: string, credentialRefs: Record<string, unknown>): Record<string, string>;
  getState(automationId: string, key: string): unknown;
  setState(automationId: string, key: string, value: unknown): void;
  getAgentForTarget(target: { kind: string; value?: string }, requiredCaps?: Partial<CapabilityReport>): AgentDispatch;
  saveRun(record: RunRecord): void;
  saveNodeExecution(record: NodeExecutionRecord): void;
  updateNodeExecution(id: string, updates: Partial<NodeExecutionRecord>): void;
  now: () => Date;
}

type NodeOutputMap = Map<string, NodeItem[]>;

function buildAdjacencyList(edges: AutomationEdge[]): Map<string, { node: AutomationNode; port: string }[]> {
  const adj = new Map<string, { node: AutomationNode; port: string }[]>();
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    const targets = adj.get(edge.source)!;
    const targetNode = undefined;
    targets.push({ node: undefined as any, port: edge.targetPort });
  }
  return adj;
}

function findDownstreamNodes(definition: AutomationDefinition, fromNodeId: string): Set<string> {
  const visited = new Set<string>();
  const queue = [fromNodeId];
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of definition.edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  return visited;
}

function findUpstreamNodes(definition: AutomationDefinition, toNodeId: string): Set<string> {
  const visited = new Set<string>();
  const queue = [toNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of definition.edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }

  return visited;
}

function getTriggerNodes(definition: AutomationDefinition): AutomationNode[] {
  return definition.nodes.filter((n) => n.type.startsWith("trigger."));
}

function getInputsForNode(
  nodeId: string,
  definition: AutomationDefinition,
  outputs: NodeOutputMap,
): NodeItem[] {
  const incoming = definition.edges.filter((e) => e.target === nodeId);
  if (incoming.length === 0) return [];

  const allItems: NodeItem[] = [];
  for (const edge of incoming) {
    const sourceOutput = outputs.get(edge.source);
    if (sourceOutput) {
      allItems.push(...sourceOutput);
    }
  }
  return allItems;
}

export class ExecutionEngine {
  private deps: ExecutionDependencies;

  constructor(deps: ExecutionDependencies) {
    this.deps = deps;
  }

  async execute(
    definition: AutomationDefinition,
    automationId: string,
    versionId: string,
    options: RunOptions,
  ): Promise<RunRecord> {
    const runId = randomUUID();
    const startedAt = this.deps.now().toISOString();

    const run: RunRecord = {
      id: runId,
      automationId,
      versionId,
      mode: options.mode,
      status: "running",
      startedAt,
      finishedAt: null,
      error: null,
      nodeExecutions: [],
    };

    this.deps.saveRun(run);

    const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));
    let nodesToExecute: Set<string>;

    if (options.fromNodeId) {
      const upstream = findUpstreamNodes(definition, options.fromNodeId);
      nodesToExecute = upstream;
    } else {
      nodesToExecute = new Set(definition.nodes.map((n) => n.id));
    }

    const topologicalOrder = this.topologicalSort(definition);
    const executionOrder = topologicalOrder.filter((id) => nodesToExecute.has(id));

    const outputs: NodeOutputMap = new Map();
    const isDryRun = options.dryRun ?? options.mode === "dry";

    let runTimedOut = false;
    const runTimeoutMs = (definition.settings.runTimeoutSec ?? 3600) * 1000;
    const runDeadline = Date.now() + runTimeoutMs;

    for (const nodeId of executionOrder) {
      if (run.status !== "running") break;
      if (Date.now() > runDeadline) {
        run.status = "error";
        run.error = "Run timed out";
        runTimedOut = true;
        break;
      }

      const node = nodeMap.get(nodeId)!;
      if (node.disabled) continue;

      const nodeDef = nodeRegistry.lookup(node.type, node.typeVersion);
      if (!nodeDef) {
        run.status = "error";
        run.error = `Unknown node type: ${node.type}@${node.typeVersion}`;
        break;
      }

      const agent = this.deps.getAgentForTarget(node.target, nodeDef.requiredCapabilities);
      const inputItems = getInputsForNode(nodeId, definition, outputs);

      if (options.pinData && options.pinData[nodeId]) {
        outputs.set(nodeId, options.pinData[nodeId]);
        const nodeExecRecord = this.createNodeExecRecord(
          runId, nodeId, agent.agentId, "success", 0, false,
          inputItems, options.pinData[nodeId], true,
          startedAt, 0, null,
        );
        run.nodeExecutions.push(nodeExecRecord);
        this.deps.saveNodeExecution(nodeExecRecord);
        continue;
      }

      const env = this.deps.resolveEnv(agent.agentId, automationId, node.type);
      const secrets = this.deps.resolveSecrets(agent.agentId, node.credentials ?? {});

      const exprContext: ExpressionContext = {
        json: inputItems.length > 0 ? inputItems[0].json : {},
        items: inputItems,
        node: { id: node.id, name: node.name },
        env,
        state: this.createStateAccess(automationId) as any,
        now: this.deps.now(),
      };

      const resolvedParams = resolveParams(node.params, exprContext);

      const nodeTimeoutSec = node.timeoutSec ?? 300;

      if (isDryRun && nodeDef.sideEffecting && nodeDef.simulate) {
        const stateAccess = this.createStateAccess(automationId);
        const simCtx = {
          ...exprContext,
          params: resolvedParams,
          state: stateAccess,
          agentId: agent.agentId,
          runId,
          dryRun: true,
        } as any;
        const simResult = await this.executeWithTimeout(
          nodeDef.simulate(simCtx),
          nodeTimeoutSec * 1000,
        );

        const nodeExecRecord = this.createNodeExecRecord(
          runId, nodeId, agent.agentId, "success", 0, true,
          inputItems, simResult.data ?? [], false,
          startedAt, 0, null,
        );
        run.nodeExecutions.push(nodeExecRecord);
        this.deps.saveNodeExecution(nodeExecRecord);
        continue;
      }

      if (isDryRun && !nodeDef.sideEffecting) {
      }

      const retry = node.retry ?? { attempts: 3, backoffSec: [2, 8, 30] };
      let lastError: string | null = null;
      let succeeded = false;

      for (let attempt = 0; attempt < retry.attempts; attempt++) {
        if (run.status !== "running") break;

        const nodeExecId = randomUUID();
        const nodeStart = this.deps.now().toISOString();

        try {
          const stateAccess = this.createStateAccess(automationId);
          const result = await agent.send(
            nodeExecId,
            nodeDef,
            resolvedParams,
            inputItems,
            secrets,
            env,
            isDryRun,
            nodeTimeoutSec,
            stateAccess,
            runId,
            automationId,
          );

          outputs.set(nodeId, result.items);

          const nodeExecRecord = this.createNodeExecRecord(
            runId, nodeId, agent.agentId, "success", attempt, isDryRun && nodeDef.sideEffecting,
            inputItems, result.items, false,
            nodeStart, result.durationMs, null,
          );
          run.nodeExecutions.push(nodeExecRecord);
          this.deps.saveNodeExecution(nodeExecRecord);
          succeeded = true;
          break;
        } catch (err: any) {
          lastError = err?.message ?? String(err);

          if (attempt < retry.attempts - 1) {
            const backoff = retry.backoffSec[Math.min(attempt, retry.backoffSec.length - 1)] ?? 2;
            await this.sleep(backoff * 1000);
          }
        }
      }

      if (!succeeded) {
        const nodeExecRecord = this.createNodeExecRecord(
          runId, nodeId, agent.agentId, "error", retry.attempts, isDryRun && nodeDef.sideEffecting,
          inputItems, null, false,
          startedAt, 0, lastError,
        );
        run.nodeExecutions.push(nodeExecRecord);
        this.deps.saveNodeExecution(nodeExecRecord);

        if (this.hasErrorPath(nodeId, definition)) {
          outputs.set(nodeId, []);
        } else {
          run.status = "error";
          run.error = lastError ?? `Node ${node.name} failed after ${retry.attempts} attempts`;
        }
      }
    }

    if (run.status === "running") {
      run.status = "success";
    }
    run.finishedAt = this.deps.now().toISOString();
    this.deps.saveRun(run);

    return run;
  }

  private topologicalSort(definition: AutomationDefinition): string[] {
    const nodeIds = new Set(definition.nodes.map((n) => n.id));
    const inDegree = new Map<string, number>();
    for (const id of nodeIds) inDegree.set(id, 0);

    for (const edge of definition.edges) {
      const current = inDegree.get(edge.target) ?? 0;
      inDegree.set(edge.target, current + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const edge of definition.edges) {
        if (edge.source === current) {
          const newDeg = (inDegree.get(edge.target) ?? 1) - 1;
          inDegree.set(edge.target, newDeg);
          if (newDeg === 0) queue.push(edge.target);
        }
      }
    }

    return result;
  }

  private hasErrorPath(nodeId: string, definition: AutomationDefinition): boolean {
    return definition.edges.some(
      (e) => e.source === nodeId && e.sourcePort === "error",
    );
  }

  private createNodeExecRecord(
    runId: string, nodeId: string, agentId: string,
    status: NodeExecutionRecord["status"], attempt: number, simulated: boolean,
    input: NodeItem[] | null, output: NodeItem[] | null, pinned: boolean,
    startedAt: string, durationMs: number, error: string | null,
  ): NodeExecutionRecord {
    return {
      id: randomUUID(), runId, nodeId, agentId, status, attempt,
      simulated, input, output, pinned, startedAt, durationMs, error,
    };
  }

  private createStateProxy(automationId: string): Record<string, unknown> {
    return new Proxy({} as Record<string, unknown>, {
      get: (_target, prop: string) => this.deps.getState(automationId, prop),
      set: (_target, prop: string, value: unknown) => {
        this.deps.setState(automationId, prop, value);
        return true;
      },
    });
  }

  private createStateAccess(automationId: string): StateAccess {
    return {
      get: (key: string) => this.deps.getState(automationId, key),
      set: (key: string, value: unknown) => this.deps.setState(automationId, key, value),
    };
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs),
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
