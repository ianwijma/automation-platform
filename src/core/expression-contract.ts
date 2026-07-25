import type { NodeItem } from "./node-contract.js";

export interface ExpressionContext {
  json: Record<string, unknown>;
  items: NodeItem[];
  node: {
    id: string;
    name: string;
  };
  env: Record<string, string>;
  state: Record<string, unknown>;
  now: Date;
}

export interface ExpressionEvaluator {
  evaluate(expression: string, context: ExpressionContext): unknown;
  evaluateAll(template: string, context: ExpressionContext): string;
}

export interface ExpressionParseResult {
  hasExpressions: boolean;
  expressions: string[];
  staticParts: string[];
}
