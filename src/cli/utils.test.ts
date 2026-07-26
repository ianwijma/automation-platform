import { describe, test, expect } from "bun:test";
import { openBrowser } from "./utils.js";

describe("openBrowser", () => {
  test("returns false with empty candidates list", () => {
    const result = openBrowser("http://localhost:99999", []);
    expect(result).toBe(false);
  });

  test("returns false with non-existent browser candidate", () => {
    const result = openBrowser("http://localhost:99999", ["nonexistent-browser-xyz"]);
    expect(result).toBe(false);
  });

  test("does not spawn real browsers in tests", () => {
    const result = openBrowser("http://localhost:1", ["definitely-not-a-real-browser"]);
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });
});
