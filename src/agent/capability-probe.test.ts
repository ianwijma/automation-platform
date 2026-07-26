import { describe, test, expect } from "bun:test";
import { probeCapabilities } from "./capability-probe.js";
import type { CapabilityReport } from "../core/node-contract.js";

describe("probeCapabilities", () => {
  test("returns a valid CapabilityReport with all required fields", async () => {
    const report: CapabilityReport = await probeCapabilities();

    expect(typeof report.os).toBe("string");
    expect(["linux", "darwin", "win32"]).toContain(report.os);

    expect(typeof report.arch).toBe("string");
    expect(report.arch.length).toBeGreaterThan(0);

    expect(["x11", "wayland", "none"]).toContain(report.display);

    expect(Array.isArray(report.tools)).toBe(true);
    for (const tool of report.tools) {
      expect(typeof tool).toBe("string");
    }

    expect(typeof report.screen).toBe("boolean");

    expect(["xdotool", "ydotool", "none"]).toContain(report.input);

    if (report.gpu !== undefined) {
      expect(typeof report.gpu).toBe("boolean");
    }
  });

  test("screen is true only when display is not none and screenshot tool exists", async () => {
    const report = await probeCapabilities();
    const screenshotTools = ["maim", "scrot", "grim", "import"];
    const hasScreenshotTool = report.tools.some((t) => screenshotTools.includes(t));

    if (report.display === "none" || !hasScreenshotTool) {
      expect(report.screen).toBe(false);
    } else {
      expect(report.screen).toBe(true);
    }
  });

  test("input is xdotool when xdotool available and display is x11", async () => {
    const report = await probeCapabilities();
    if (report.tools.includes("xdotool") && report.display === "x11") {
      expect(report.input).toBe("xdotool");
    } else if (report.tools.includes("ydotool")) {
      expect(report.input).toBe("ydotool");
    } else {
      expect(report.input).toBe("none");
    }
  });

  test("os matches process.platform", async () => {
    const report = await probeCapabilities();
    expect(report.os).toBe(process.platform);
  });

  test("arch matches process.arch", async () => {
    const report = await probeCapabilities();
    expect(report.arch).toBe(process.arch);
  });
});
