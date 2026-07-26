import { describe, test, expect, beforeEach } from "bun:test";
import { startPolling, stopPolling, isPolling, getPollInfo, clearAllPolls } from "./polling-manager.js";

const mockExecutePoll = async (_targetType: string, _target: string): Promise<Record<string, unknown>> => {
  return { status: 200, body: "mock-response" };
};

describe("PollingManager", () => {
  beforeEach(() => {
    clearAllPolls();
  });

  test("startPolling begins polling for an automation", async () => {
    startPolling("auto-1", {
      intervalSec: 600,
      targetType: "url",
      target: "http://example.com/health",
      stopAfter: 0,
    }, {} as any, {} as any, mockExecutePoll);

    await new Promise((r) => setTimeout(r, 50));

    expect(isPolling("auto-1")).toBe(true);
  });

  test("startPolling replaces existing poll for same automation", () => {
    startPolling("auto-1", {
      intervalSec: 300,
      targetType: "url",
      target: "http://a.com",
      stopAfter: 0,
    }, {} as any, {} as any, mockExecutePoll);
    startPolling("auto-1", {
      intervalSec: 600,
      targetType: "url",
      target: "http://b.com",
      stopAfter: 0,
    }, {} as any, {} as any, mockExecutePoll);
    expect(isPolling("auto-1")).toBe(true);
  });

  test("stopPolling removes the poll entry", async () => {
    startPolling("auto-2", {
      intervalSec: 600,
      targetType: "url",
      target: "http://example.com",
      stopAfter: 0,
    }, {} as any, {} as any, mockExecutePoll);

    await new Promise((r) => setTimeout(r, 50));
    expect(isPolling("auto-2")).toBe(true);

    stopPolling("auto-2");
    expect(isPolling("auto-2")).toBe(false);
  });

  test("stopPolling on non-existent entry does nothing", () => {
    stopPolling("no-auto");
    expect(isPolling("no-auto")).toBe(false);
  });

  test("getPollInfo returns null for non-existent", () => {
    expect(getPollInfo("nope")).toBeNull();
  });

  test("getPollInfo returns pollCount and lastHash after poll cycle", async () => {
    startPolling("auto-3", {
      intervalSec: 600,
      targetType: "url",
      target: "http://slow.example.com",
      stopAfter: 0,
    }, {} as any, {} as any, mockExecutePoll);

    await new Promise((r) => setTimeout(r, 50));

    const info = getPollInfo("auto-3");
    expect(info).not.toBeNull();
    expect(info!.pollCount).toBeGreaterThanOrEqual(1);
    expect(info!.lastHash).not.toBeNull();
  });

  test("clearAllPolls removes all entries", () => {
    startPolling("a1", { intervalSec: 600, targetType: "url", target: "http://a.com", stopAfter: 0 }, {} as any, {} as any, mockExecutePoll);
    startPolling("a2", { intervalSec: 300, targetType: "url", target: "http://b.com", stopAfter: 0 }, {} as any, {} as any, mockExecutePoll);
    clearAllPolls();
    expect(isPolling("a1")).toBe(false);
    expect(isPolling("a2")).toBe(false);
  });

  test("hash-based change detection: same result does not increment pollCount beyond initial", async () => {
    let callCount = 0;
    const staticPoll = async () => {
      callCount++;
      return { status: 200, body: "same" };
    };

    startPolling("auto-h", {
      intervalSec: 600,
      targetType: "url",
      target: "http://test.example.com",
      stopAfter: 0,
    }, {} as any, {} as any, staticPoll);

    await new Promise((r) => setTimeout(r, 50));

    const info = getPollInfo("auto-h");
    expect(info).not.toBeNull();
    expect(info!.pollCount).toBe(1);
    expect(callCount).toBe(1);

    clearAllPolls();
  });
});
