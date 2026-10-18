import { portalCall } from "../core/desktop-driver.js";
import type { CapabilityReport } from "../core/node-contract.js";

async function commandExists(tool: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", tool], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function spawnCapture(
  cmd: string[],
  env?: Record<string, string>,
): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      env: env ? { ...process.env, ...env } : undefined,
    });
    await proc.exited;
    return await new Response(proc.stdout).text();
  } catch {
    return "";
  }
}

function detectDisplay(): "x11" | "wayland" | "none" {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if (sessionType === "wayland") return "wayland";
  if (sessionType === "x11") return "x11";

  if (process.env.WAYLAND_DISPLAY) return "wayland";
  if (process.env.DISPLAY) return "x11";

  return "none";
}

async function detectGpu(): Promise<boolean | undefined> {
  try {
    const file = Bun.file("/proc/driver/nvidia/version");
    const exists = await file.exists();
    if (exists) return true;
  } catch {}

  try {
    const output = await spawnCapture(["lspci"]);
    if (/vga.*nvidia/i.test(output) || /vga.*amd/i.test(output)) return true;
  } catch {}

  return undefined;
}

export async function probeCapabilities(): Promise<CapabilityReport> {
  const os = process.platform;
  const arch = process.arch;
  const display = detectDisplay();

  const toolCandidates = [
    "tesseract",
    "xdotool",
    "ydotool",
    "maim",
    "scrot",
    "grim",
    "import",
    "wmctrl",
    "xwininfo",
    "hyprctl",
    "swaymsg",
    "slurp",
    "compare",
    "identify",
    "convert",
    "gst-launch-1.0",
  ];

  const tools: string[] = [];
  const toolChecks = await Promise.all(
    toolCandidates.map(async (tool) => {
      const exists = await commandExists(tool);
      return { tool, exists };
    }),
  );
  for (const { tool, exists } of toolChecks) {
    if (exists) tools.push(tool);
  }

  const screenshotTools = ["maim", "scrot", "grim", "import"];
  const hasScreenshotTool = screenshotTools.some((t) => tools.includes(t));
  let screen =
    display === "x11" &&
    hasScreenshotTool &&
    !!(await spawnCapture(["xdotool", "getdisplaygeometry"])).trim();

  let input: CapabilityReport["input"] = "none";
  if (tools.includes("xdotool") && display === "x11") {
    input = (await spawnCapture(["xdotool", "getdisplaygeometry"])).trim()
      ? "xdotool"
      : "none";
  }
  if (display === "wayland") {
    try {
      const status = await portalCall({ op: "status" });
      screen =
        status.portal === true &&
        tools.includes("gst-launch-1.0") &&
        tools.includes("convert");
      input = status.portal === true ? "portal" : "none";
    } catch {
      screen = false;
      input = "none";
    }
  }

  const gpu = await detectGpu();

  return { os, arch, display, tools, screen, input, gpu };
}
