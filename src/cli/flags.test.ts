import { describe, test, expect } from "bun:test";
import { parseCliFlags } from "./flags.js";

describe("parseCliFlags", () => {
  test("parses serve subcommand", () => {
    const result = parseCliFlags(["serve"]);
    expect(result.rest).toEqual(["serve"]);
  });

  test("parses join subcommand with token", () => {
    const result = parseCliFlags(["join", "http://example.com", "--token", "abc123"]);
    expect(result.rest).toEqual(["join", "http://example.com"]);
    expect(result.token).toBe("abc123");
  });

  test("parses agent subcommand", () => {
    const result = parseCliFlags(["agent"]);
    expect(result.rest).toEqual(["agent"]);
  });

  test("parses --port flag", () => {
    const result = parseCliFlags(["--port", "3000"]);
    expect(result.port).toBe(3000);
  });

  test("ignores --port with non-numeric value", () => {
    const result = parseCliFlags(["--port", "abc"]);
    expect(result.port).toBeUndefined();
  });

  test("parses --no-browser flag", () => {
    const result = parseCliFlags(["--no-browser"]);
    expect(result.noBrowser).toBe(true);
  });

  test("parses --public-url flag", () => {
    const result = parseCliFlags(["--public-url", "https://example.com"]);
    expect(result.publicUrl).toBe("https://example.com");
  });

  test("parses --token flag", () => {
    const result = parseCliFlags(["--token", "secret-tok"]);
    expect(result.token).toBe("secret-tok");
  });

  test("combines flags and subcommands", () => {
    const result = parseCliFlags(["serve", "--port", "8080", "--no-browser"]);
    expect(result.rest).toEqual(["serve"]);
    expect(result.port).toBe(8080);
    expect(result.noBrowser).toBe(true);
  });

  test("default values are undefined", () => {
    const result = parseCliFlags([]);
    expect(result.port).toBeUndefined();
    expect(result.noBrowser).toBeUndefined();
    expect(result.publicUrl).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.rest).toEqual([]);
  });

  test("unknown flags pass through to rest", () => {
    const result = parseCliFlags(["--unknown", "value", "subcmd"]);
    expect(result.rest).toEqual(["--unknown", "value", "subcmd"]);
  });
});
