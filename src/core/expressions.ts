import type { ExpressionContext, ExpressionEvaluator, ExpressionParseResult } from "../core/expression-contract.js";
import type { NodeItem } from "../core/node-contract.js";

const EXPR_PATTERN = /\{\{(.+?)\}\}/g;

function buildSandboxCode(expression: string, contextVar: string): string {
  return `
    "use strict";
    const $json = ${contextVar}.json;
    const $items = ${contextVar}.items;
    const $node = ${contextVar}.node;
    const $env = ${contextVar}.env;
    const $state = ${contextVar}.state;
    const $now = ${contextVar}.now;
    try {
      return (${expression});
    } catch(e) {
      return undefined;
    }
  `;
}

function toSimpleValue(val: unknown): unknown {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === "object") {
    try {
      return JSON.parse(JSON.stringify(val));
    } catch {
      return String(val);
    }
  }
  return val;
}

export function parseExpressions(template: string): ExpressionParseResult {
  const expressions: string[] = [];
  const staticParts: string[] = [];
  let hasExpressions = false;
  let lastIndex = 0;

  const pattern = /\{\{(.+?)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    hasExpressions = true;
    staticParts.push(template.slice(lastIndex, match.index));
    expressions.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }

  staticParts.push(template.slice(lastIndex));

  return { hasExpressions, expressions, staticParts };
}

export function createExpressionEvaluator(): ExpressionEvaluator {
  return {
    evaluate(expression: string, context: ExpressionContext): unknown {
      const contextJson = JSON.stringify({
        json: context.json,
        items: context.items,
        node: context.node,
        env: context.env,
        state: context.state,
        now: context.now.toISOString(),
      });

      const code = buildSandboxCode(expression, "ctx");
      const fn = new Function("ctx", code);
      const parsedCtx = JSON.parse(contextJson);
      parsedCtx.now = context.now;
      const raw = fn(parsedCtx);
      return toSimpleValue(raw);
    },

    evaluateAll(template: string, context: ExpressionContext): string {
      const parsed = parseExpressions(template);
      if (!parsed.hasExpressions) return template;

      const results: string[] = [];
      for (let i = 0; i < parsed.expressions.length; i++) {
        const val = this.evaluate(parsed.expressions[i], context);
        results.push(val === undefined ? "" : String(val));
      }

      let output = "";
      for (let i = 0; i < parsed.staticParts.length; i++) {
        output += parsed.staticParts[i];
        if (i < results.length) {
          output += results[i];
        }
      }
      return output;
    },
  };
}

export function resolveParams(
  params: Record<string, unknown>,
  context: ExpressionContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      const parsed = parseExpressions(value);
      if (parsed.hasExpressions) {
        const evaluator = createExpressionEvaluator();
        result[key] = evaluator.evaluateAll(value, context);
      } else {
        result[key] = value;
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = resolveParams(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }
  return result;
}
