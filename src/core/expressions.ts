import type {
  ExpressionContext,
  ExpressionEvaluator,
  ExpressionParseResult,
} from "./expression-contract.js";
import { evaluateSandbox } from "./sandbox.js";
export function parseExpressions(template: string): ExpressionParseResult {
  const expressions: string[] = [],
    staticParts: string[] = [];
  let last = 0;
  for (const match of template.matchAll(/\{\{([\s\S]+?)\}\}/g)) {
    staticParts.push(template.slice(last, match.index));
    expressions.push(match[1].trim());
    last = match.index! + match[0].length;
  }
  staticParts.push(template.slice(last));
  return { expressions, staticParts, hasExpressions: expressions.length > 0 };
}
export function createExpressionEvaluator(): ExpressionEvaluator {
  return {
    evaluate(expression, context) {
      expression = expression.replace(/^\s*\{\{([\s\S]*)\}\}\s*$/, "$1");
      return evaluateSandbox(
        `const $json=ctx.json, $items=ctx.items, $node=ctx.node, $env=ctx.env, $state=ctx.state, $now=new Date(ctx.now); (${expression});`,
        context as unknown as Record<string, unknown>,
      );
    },
    evaluateAll(template, context) {
      return template.replace(/\{\{([\s\S]+?)\}\}/g, (_, expr) => {
        const value = this.evaluate(expr, context);
        return value == null
          ? ""
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      });
    },
  };
}
export function resolveParams(
  params: Record<string, unknown>,
  context: ExpressionContext,
): Record<string, unknown> {
  const evaluator = createExpressionEvaluator();
  function resolve(value: unknown): unknown {
    if (typeof value === "string") {
      const whole = value.match(/^\{\{([\s\S]+?)\}\}$/);
      return whole
        ? evaluator.evaluate(whole[1], context)
        : evaluator.evaluateAll(value, context);
    }
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, resolve(v)]),
      );
    return value;
  }
  return resolve(params) as Record<string, unknown>;
}
