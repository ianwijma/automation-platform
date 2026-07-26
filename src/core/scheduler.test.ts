import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { nodeRegistry } from "./node-registry.js";
import { NodeRegistry } from "./node-registry.js";
import "../nodes/index.js";
import { parseCron, cronMatches, Scheduler } from "./scheduler.js";

describe("Trigger Node Registration", () => {
  test("schedule trigger is registered", () => {
    const def = nodeRegistry.lookup("trigger.schedule", 1);
    expect(def).toBeDefined();
    expect(def!.type).toBe("trigger.schedule");
    expect(def!.version).toBe(1);
    expect(def!.category).toBe("triggers");
    expect(def!.sideEffecting).toBe(false);
    expect(def!.inputs).toEqual([]);
    expect(def!.outputs).toEqual([{ name: "out", type: "item" }]);
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).cron).toBeDefined();
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).timezone).toBeDefined();
  });

  test("webhook trigger is registered", () => {
    const def = nodeRegistry.lookup("trigger.webhook", 1);
    expect(def).toBeDefined();
    expect(def!.type).toBe("trigger.webhook");
    expect(def!.version).toBe(1);
    expect(def!.category).toBe("triggers");
    expect(def!.sideEffecting).toBe(false);
    expect(def!.inputs).toEqual([]);
    expect(def!.outputs).toEqual([{ name: "out", type: "item" }]);
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).path).toBeDefined();
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).method).toBeDefined();
  });

  test("polling trigger is registered", () => {
    const def = nodeRegistry.lookup("trigger.polling", 1);
    expect(def).toBeDefined();
    expect(def!.type).toBe("trigger.polling");
    expect(def!.version).toBe(1);
    expect(def!.category).toBe("triggers");
    expect(def!.sideEffecting).toBe(true);
    expect(def!.inputs).toEqual([]);
    expect(def!.outputs).toEqual([{ name: "out", type: "item" }]);
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).intervalSec).toBeDefined();
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).targetType).toBeDefined();
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).target).toBeDefined();
    expect((def!.paramsSchema as Record<string, Record<string, unknown>>).stopAfter).toBeDefined();
  });

  test("schedule trigger run returns triggeredAt and cron", async () => {
    const def = nodeRegistry.lookup("trigger.schedule", 1)!;
    const ctx = {
      nodeId: "test",
      nodeName: "Schedule Trigger",
      params: { cron: "0 2 * * *", timezone: "UTC" },
      items: [],
      env: {},
      secrets: {},
      state: { get: () => undefined, set: () => {} },
      now: new Date("2025-01-01T02:00:00Z"),
      agentId: "local",
      runId: "test-run",
      dryRun: false,
    };
    const result = await def.run(ctx as any);
    expect(result).toHaveLength(1);
    expect(result[0].json.cron).toBe("0 2 * * *");
    expect(result[0].json.triggeredAt).toBe("2025-01-01T02:00:00.000Z");
  });

  test("webhook trigger run returns webhook data", async () => {
    const def = nodeRegistry.lookup("trigger.webhook", 1)!;
    const ctx = {
      nodeId: "test",
      nodeName: "Webhook Trigger",
      params: { path: "my-hook", method: "POST" },
      items: [{ json: { hello: "world" } }],
      env: {},
      secrets: {},
      state: { get: () => undefined, set: () => {} },
      now: new Date("2025-01-01T00:00:00Z"),
      agentId: "local",
      runId: "auto-123",
      dryRun: false,
    };
    const result = await def.run(ctx as any);
    expect(result).toHaveLength(1);
    expect(result[0].json.webhookPath).toBe("my-hook");
    expect(result[0].json.method).toBe("POST");
    expect((result[0].json.body as Record<string, unknown>).hello).toBe("world");
  });

  test("polling trigger simulate returns description", async () => {
    const def = nodeRegistry.lookup("trigger.polling", 1)!;
    const ctx = {
      nodeId: "test",
      nodeName: "Polling Trigger",
      params: { intervalSec: 30, targetType: "url", target: "https://example.com", stopAfter: 10 },
      items: [],
      env: {},
      secrets: {},
      state: { get: () => undefined, set: () => {} },
      now: new Date(),
      agentId: "local",
      runId: "test-run",
      dryRun: false,
    };
    const result = await def.simulate!(ctx as any);
    expect(result.description).toBe("Polling Trigger");
    expect(result.wouldDo).toContain("url");
    expect(result.wouldDo).toContain("30");
  });
});

describe("Cron Parser", () => {
  test("* * * * * matches any minute", () => {
    const parsed = parseCron("* * * * *");
    const date = new Date("2025-06-15T14:37:00Z");
    expect(cronMatches(parsed, date)).toBe(true);
  });

  test("0 2 * * * matches 2am on the minute", () => {
    const parsed = parseCron("0 2 * * *");
    const matching = new Date("2025-06-15T02:00:00Z");
    const notMatchingHour = new Date("2025-06-15T03:00:00Z");
    const notMatchingMinute = new Date("2025-06-15T02:30:00Z");
    expect(cronMatches(parsed, matching)).toBe(true);
    expect(cronMatches(parsed, notMatchingHour)).toBe(false);
    expect(cronMatches(parsed, notMatchingMinute)).toBe(false);
  });

  test("*/5 * * * * matches every 5 minutes", () => {
    const parsed = parseCron("*/5 * * * *");
    const t0 = new Date("2025-06-15T10:00:00Z");
    const t5 = new Date("2025-06-15T10:05:00Z");
    const t10 = new Date("2025-06-15T10:10:00Z");
    const t3 = new Date("2025-06-15T10:03:00Z");
    expect(cronMatches(parsed, t0)).toBe(true);
    expect(cronMatches(parsed, t5)).toBe(true);
    expect(cronMatches(parsed, t10)).toBe(true);
    expect(cronMatches(parsed, t3)).toBe(false);
  });

  test("30 */2 * * * matches minute 30 on every 2nd hour", () => {
    const parsed = parseCron("30 */2 * * *");
    const h2 = new Date("2025-06-15T02:30:00Z");
    const h4 = new Date("2025-06-15T04:30:00Z");
    const h3 = new Date("2025-06-15T03:30:00Z");
    expect(cronMatches(parsed, h2)).toBe(true);
    expect(cronMatches(parsed, h4)).toBe(true);
    expect(cronMatches(parsed, h3)).toBe(false);
  });

  test("0 0 1 1 * matches Jan 1st midnight", () => {
    const parsed = parseCron("0 0 1 1 *");
    const jan1 = new Date("2025-01-01T00:00:00Z");
    const jan2 = new Date("2025-01-02T00:00:00Z");
    expect(cronMatches(parsed, jan1)).toBe(true);
    expect(cronMatches(parsed, jan2)).toBe(false);
  });

  test("0 0 * * 1 matches Mondays at midnight", () => {
    const parsed = parseCron("0 0 * * 1");
    const monday = new Date("2025-06-16T00:00:00Z");
    const tuesday = new Date("2025-06-17T00:00:00Z");
    expect(monday.getDay()).toBe(1);
    expect(cronMatches(parsed, monday)).toBe(true);
    expect(cronMatches(parsed, tuesday)).toBe(false);
  });

  test("comma-separated values match correctly", () => {
    const parsed = parseCron("0,30 * * * *");
    const h0 = new Date("2025-06-15T10:00:00Z");
    const h30 = new Date("2025-06-15T10:30:00Z");
    const h15 = new Date("2025-06-15T10:15:00Z");
    expect(cronMatches(parsed, h0)).toBe(true);
    expect(cronMatches(parsed, h30)).toBe(true);
    expect(cronMatches(parsed, h15)).toBe(false);
  });

  test("invalid cron expression throws", () => {
    expect(() => parseCron("* * *")).toThrow();
    expect(() => parseCron("60 * * * *")).toThrow();
  });
});

describe("Scheduler", () => {
  let scheduler: Scheduler;

  beforeAll(() => {
    scheduler = new Scheduler();
  });

  afterAll(() => {
    scheduler.stop();
  });

  test("add and remove schedule", () => {
    const callback = () => {};
    scheduler.addSchedule("auto-1", "* * * * *", "UTC", callback);
    expect(scheduler.getScheduleCount()).toBe(1);
    scheduler.removeSchedule("auto-1");
    expect(scheduler.getScheduleCount()).toBe(0);
  });

  test("callback fires on matching schedule", async () => {
    const scheduler2 = new Scheduler();
    let fired = false;

    scheduler2.addSchedule("auto-fire", "* * * * *", "UTC", () => {
      fired = true;
    });

    scheduler2.start();

    await new Promise((resolve) => setTimeout(resolve, 1500));

    scheduler2.stop();
    expect(fired).toBe(true);
  });

  test("callback does not fire twice in the same minute", async () => {
    const scheduler3 = new Scheduler();
    let fireCount = 0;

    scheduler3.addSchedule("auto-dedup", "* * * * *", "UTC", () => {
      fireCount++;
    });

    scheduler3.start();

    await new Promise((resolve) => setTimeout(resolve, 3000));

    scheduler3.stop();
    expect(fireCount).toBeLessThanOrEqual(1);
  });

  test("specific cron only fires at the right time", async () => {
    const scheduler4 = new Scheduler();
    let fired = false;

    const nextMinute = new Date();
    nextMinute.setMinutes(nextMinute.getMinutes() + 1);
    nextMinute.setSeconds(0);
    nextMinute.setMilliseconds(0);

    const minute = nextMinute.getMinutes();
    const hour = nextMinute.getHours();
    const cronExpr = `${minute} ${hour} * * *`;

    scheduler4.addSchedule("auto-specific", cronExpr, "UTC", () => {
      fired = true;
    });

    scheduler4.start();

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const now = new Date();
    const isInTargetMinute =
      now.getHours() === hour && now.getMinutes() === minute;

    scheduler4.stop();

    if (isInTargetMinute) {
      expect(fired).toBe(true);
    } else {
      expect(fired).toBe(false);
    }
  });
});
