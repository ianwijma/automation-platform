import { describe, test, expect } from "bun:test";
import {
  parseExpressions,
  createExpressionEvaluator,
  resolveParams,
} from "./expressions.js";
import type { ExpressionContext } from "./expression-contract.js";

function makeContext(overrides: Partial<ExpressionContext> = {}): ExpressionContext {
  return {
    json: {},
    items: [],
    node: { id: "n1", name: "Test" },
    env: {},
    state: {},
    now: new Date("2025-06-15T12:00:00Z"),
    ...overrides,
  };
}

describe("parseExpressions", () => {
  test("parses {{ $json.foo }}", () => {
    const result = parseExpressions("{{ $json.foo }}");
    expect(result.hasExpressions).toBe(true);
    expect(result.expressions).toEqual(["$json.foo"]);
    expect(result.staticParts).toEqual(["", ""]);
  });

  test("parses {{ 1 + 2 }}", () => {
    const result = parseExpressions("{{ 1 + 2 }}");
    expect(result.hasExpressions).toBe(true);
    expect(result.expressions).toEqual(["1 + 2"]);
  });

  test("parses {{ \"hello\" }}", () => {
    const result = parseExpressions('{{ "hello" }}');
    expect(result.hasExpressions).toBe(true);
    expect(result.expressions).toEqual(['"hello"']);
  });

  test("parses {{ $items.length }}", () => {
    const result = parseExpressions("{{ $items.length }}");
    expect(result.hasExpressions).toBe(true);
    expect(result.expressions).toEqual(["$items.length"]);
  });

  test("returns hasExpressions=false for plain string", () => {
    const result = parseExpressions("no expressions here");
    expect(result.hasExpressions).toBe(false);
    expect(result.expressions).toEqual([]);
    expect(result.staticParts).toEqual(["no expressions here"]);
  });

  test("parses multiple expressions in one string", () => {
    const result = parseExpressions("Hello {{ $json.name }}, your score is {{ $json.score }}");
    expect(result.hasExpressions).toBe(true);
    expect(result.expressions).toEqual(["$json.name", "$json.score"]);
    expect(result.staticParts).toEqual(["Hello ", ", your score is ", ""]);
  });
});

describe("createExpressionEvaluator", () => {
  const evaluator = createExpressionEvaluator();

  test("evaluate {{ $json.foo }}", () => {
    const ctx = makeContext({ json: { foo: "bar" } });
    expect(evaluator.evaluate("$json.foo", ctx)).toBe("bar");
  });

  test("evaluate {{ 1 + 2 }}", () => {
    const ctx = makeContext();
    expect(evaluator.evaluate("1 + 2", ctx)).toBe(3);
  });

  test('evaluate {{ "hello" }}', () => {
    const ctx = makeContext();
    expect(evaluator.evaluate('"hello"', ctx)).toBe("hello");
  });

  test("evaluate {{ $items.length }}", () => {
    const ctx = makeContext({
      items: [{ json: { a: 1 } }, { json: { b: 2 } }],
    });
    expect(evaluator.evaluate("$items.length", ctx)).toBe(2);
  });

  test("evaluate returns undefined for missing variable", () => {
    const ctx = makeContext({ json: {} });
    expect(evaluator.evaluate("$json.nonexistent", ctx)).toBeUndefined();
  });

  test("evaluate throws for invalid expression syntax", () => {
    const ctx = makeContext();
    expect(() => evaluator.evaluate("{{{broken", ctx)).toThrow();
  });

  test("evaluateAll with single expression", () => {
    const ctx = makeContext({ json: { name: "Alice" } });
    expect(evaluator.evaluateAll("Hello {{ $json.name }}", ctx)).toBe("Hello Alice");
  });

  test("evaluateAll with multiple expressions", () => {
    const ctx = makeContext({ json: { first: "A", last: "B" } });
    expect(evaluator.evaluateAll("{{ $json.first }}-{{ $json.last }}", ctx)).toBe("A-B");
  });

  test("evaluateAll with no expressions returns original", () => {
    const ctx = makeContext();
    expect(evaluator.evaluateAll("plain text", ctx)).toBe("plain text");
  });

  test("evaluateAll with undefined expression produces empty string", () => {
    const ctx = makeContext({ json: {} });
    expect(evaluator.evaluateAll("value: {{ $json.missing }}", ctx)).toBe("value: ");
  });

  test("evaluateAll with expression in middle of text", () => {
    const ctx = makeContext({ json: { count: 42 } });
    expect(evaluator.evaluateAll("Result: {{ $json.count }} items", ctx)).toBe("Result: 42 items");
  });
});

describe("resolveParams", () => {
  const ctx = makeContext({ json: { host: "example.com", port: 8080 } });

  test("resolves {{ }} expressions in parameter objects", () => {
    const params = { url: "https://{{ $json.host }}:{{ $json.port }}/api" };
    const result = resolveParams(params, ctx);
    expect(result.url).toBe("https://example.com:8080/api");
  });

  test("preserves non-expression string values", () => {
    const params = { plain: "no-expr" };
    const result = resolveParams(params, ctx);
    expect(result.plain).toBe("no-expr");
  });

  test("preserves non-string values (numbers, booleans)", () => {
    const params = { num: 42, flag: true };
    const result = resolveParams(params, ctx);
    expect(result.num).toBe(42);
    expect(result.flag).toBe(true);
  });

  test("resolves nested objects", () => {
    const params = {
      config: { url: "https://{{ $json.host }}", timeout: 30 },
    };
    const result = resolveParams(params, ctx);
    expect((result.config as Record<string, unknown>).url).toBe("https://example.com");
    expect((result.config as Record<string, unknown>).timeout).toBe(30);
  });

  test("resolves deeply nested objects", () => {
    const params = {
      config: { nested: { url: "https://{{ $json.host }}" } },
    };
    const result = resolveParams(params, ctx);
    const nested = (result.config as Record<string, unknown>).nested as Record<string, unknown>;
    expect(nested.url).toBe("https://example.com");
  });

  test("no expressions returns same structure", () => {
    const params = { a: 1, b: "two", c: { d: "three" } };
    const result = resolveParams(params, ctx);
    expect(result).toEqual(params);
  });

  test("empty params returns empty object", () => {
    const result = resolveParams({}, ctx);
    expect(result).toEqual({});
  });
});
