import { z } from "zod";
import { nodeRegistry } from "./node-registry.js";
import type { AutomationDefinition, AutomationNode } from "./types.js";
export const itemSchema = z.object({
  json: z.record(z.string(), z.unknown()),
  binary: z
    .record(
      z.string(),
      z.object({
        $artifact: z.string(),
        mime: z.string(),
        size: z.number().nonnegative(),
        name: z.string(),
      }),
    )
    .optional(),
});
export const targetSchema = z.object({
  kind: z.enum(["local", "machine", "tag", "any"]),
  value: z.string().optional(),
});
export const actionTargetSchema = z.object({
  kind: z.enum(["screen", "window", "region", "file", "none"]),
  display: z.string().optional(),
  monitor: z.number().int().nonnegative().optional(),
  windowId: z.string().optional(),
  windowTitle: z.string().optional(),
  appId: z.string().optional(),
  pid: z.number().int().positive().optional(),
  region: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
});
export const automationSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(200),
  settings: z.object({
    runTimeoutSec: z.number().positive().max(86400),
    savePayloads: z.boolean(),
    errorAutomationId: z.string().nullable(),
  }),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.string().min(1),
        typeVersion: z.number().int().positive(),
        name: z.string(),
        target: targetSchema,
        actionTarget: actionTargetSchema.optional(),
        params: z.record(z.string(), z.unknown()),
        credentials: z
          .object({ type: z.string().min(1), name: z.string().min(1) })
          .nullable()
          .optional(),
        retry: z
          .object({
            attempts: z.number().int().min(1).max(10),
            backoffSec: z.array(z.number().min(0).max(3600)),
          })
          .optional(),
        timeoutSec: z.number().positive().max(86400).optional(),
        disabled: z.boolean(),
        position: z.object({ x: z.number(), y: z.number() }),
      }),
    )
    .max(1000),
  edges: z
    .array(
      z.object({
        id: z.string().min(1),
        source: z.string(),
        sourcePort: z.string(),
        target: z.string(),
        targetPort: z.string(),
      }),
    )
    .max(5000),
});
export const runOptionsSchema = z.object({
  mode: z.enum(["manual", "dry", "partial"]).default("manual"),
  dryRun: z.boolean().optional(),
  fromNodeId: z.string().optional(),
  nodeScope: z.enum(["from", "to", "single"]).optional(),
  pinData: z.record(z.string(), z.array(itemSchema)).optional(),
  triggerNodeId: z.string().optional(),
  triggerData: z.array(itemSchema).optional(),
  inputData: z.array(itemSchema).optional(),
});
export function outputPorts(
  node: Pick<AutomationNode, "type" | "typeVersion" | "params">,
): string[] {
  if (node.type === "logic.switch") {
    const rules = node.params.rules as Array<{ label: string }> | undefined;
    return [
      ...new Set([
        ...(rules ?? []).map((r) => r.label),
        String(node.params.fallback || "default"),
        "error",
      ]),
    ];
  }
  return [
    ...new Set([
      ...(nodeRegistry
        .lookup(node.type, node.typeVersion)
        ?.outputs.map((p) => p.name) ?? []),
      "error",
    ]),
  ];
}
export function validateDefinition(value: unknown): AutomationDefinition {
  const definition = automationSchema.parse(value);
  const nodes = new Map(definition.nodes.map((n) => [n.id, n]));
  if (nodes.size !== definition.nodes.length)
    throw new Error("Duplicate node IDs");
  if (
    new Set(definition.edges.map((e) => e.id)).size !== definition.edges.length
  )
    throw new Error("Duplicate edge IDs");
  for (const node of definition.nodes) {
    const spec = nodeRegistry.lookup(node.type, node.typeVersion);
    if (!spec)
      throw new Error(`Unknown node type: ${node.type}@${node.typeVersion}`);
    if (["machine", "tag"].includes(node.target.kind) && !node.target.value)
      throw new Error(`${node.name}: target requires a value`);
    if (
      node.type === "logic.loop" &&
      (!Number.isInteger(node.params.batchSize ?? 1) ||
        Number(node.params.batchSize ?? 1) < 1)
    )
      throw new Error("Loop batchSize must be a positive integer");
    if (node.type === "logic.switch") {
      const rules = node.params.rules;
      if (
        rules !== undefined &&
        (!Array.isArray(rules) ||
          rules.some(
            (r) =>
              !r ||
              typeof r.label !== "string" ||
              !r.label ||
              typeof r.expression !== "string",
          ))
      )
        throw new Error("Invalid switch rules");
    }
    for (const key of Object.keys(node.params)) {
      if (!(key in spec.paramsSchema))
        throw new Error(`${node.name}: unknown parameter ${key}`);
      if (/^(apiKey|password|token)$/i.test(key) && node.params[key])
        throw new Error(`${node.name}: use a credential reference for secrets`);
      const value = node.params[key],
        field = spec.paramsSchema[key] as { type?: string };
      const expression = typeof value === "string" && value.includes("{{");
      const artifact =
        value && typeof value === "object" && "$artifact" in value;
      if (value !== undefined && !expression && !artifact) {
        const actual = Array.isArray(value)
          ? "array"
          : value === null
            ? "null"
            : typeof value;
        if (
          field.type &&
          actual !== field.type &&
          !(
            node.type === "trigger.manual" &&
            key === "testData" &&
            actual === "array"
          )
        )
          throw new Error(
            `${node.name}.${key}: expected ${field.type}, received ${actual}`,
          );
        if (actual === "number" && !Number.isFinite(value))
          throw new Error(`${node.name}.${key}: expected a finite number`);
      }
    }
  }
  for (const edge of definition.edges) {
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target);
    if (!source || !target)
      throw new Error(`Edge ${edge.id} references a missing node`);
    if (!outputPorts(source).includes(edge.sourcePort))
      throw new Error(`Unknown output ${source.name}.${edge.sourcePort}`);
    const inputs = nodeRegistry
      .lookup(target.type, target.typeVersion)!
      .inputs.map((p) => p.name);
    if (
      !inputs.includes(edge.targetPort) &&
      !(target.type === "logic.loop" && edge.targetPort === "continue")
    )
      throw new Error(`Unknown input ${target.name}.${edge.targetPort}`);
  }
  topologicalOrder(definition);
  return definition;
}
/** Only explicit loop continuation edges may form cycles. */
export function topologicalOrder(definition: AutomationDefinition): string[] {
  const edges = definition.edges.filter(
    (e) =>
      !(
        e.targetPort === "continue" &&
        definition.nodes.find((n) => n.id === e.target)?.type === "logic.loop"
      ),
  );
  const counts = new Map(
    definition.nodes.map((n) => [
      n.id,
      edges.filter((e) => e.target === n.id).length,
    ]),
  );
  const queue = [...counts].filter(([, n]) => n === 0).map(([id]) => id),
    result: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    result.push(id);
    for (const edge of edges.filter((e) => e.source === id)) {
      const count = counts.get(edge.target)! - 1;
      counts.set(edge.target, count);
      if (count === 0) queue.push(edge.target);
    }
  }
  if (result.length !== definition.nodes.length)
    throw new Error("Cycles require a Loop node's continue input");
  return result;
}
export function nodeCatalog() {
  return nodeRegistry.all().map(({ run, simulate, ...spec }) => spec);
}
