import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { createDatabase } from "../db/database.js";
import { createServer } from "../api/server.js";
import { resolveConfig, type AppConfig } from "./config.js";
import { openBrowser } from "./utils.js";
import { parseCliFlags } from "./flags.js";
import { startFleetAgent } from "../agent/fleet-agent.js";
import { probeCapabilities } from "../agent/capability-probe.js";
import { loadPlugins } from "../core/plugin-loader.js";

function ensureDataDir(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
}

async function startServer(
  config: AppConfig,
  pluginsDir?: string,
): Promise<void> {
  ensureDataDir(config.dataDir);
  const db = createDatabase(config.dbPath);

  if (pluginsDir) {
    const loader = await loadPlugins(pluginsDir);
    const names = loader.getPluginNames();
    if (names.length > 0) {
      console.log(`Loaded ${names.length} plugin(s): ${names.join(", ")}`);
    }
  }

  const { server } = createServer({
    port: config.port,
    host: config.host,
    db,
    config,
  });

  if (!config.noBrowser && config.mode !== "agent") {
    const url = `http://localhost:${config.port}`;
    openBrowser(url);
  }

  console.log(`AP_READY http://127.0.0.1:${server.port}`);
}

function handleJoin(args: string[], flags: { token?: string }): void {
  const config = resolveConfig(args, "agent");
  ensureDataDir(config.dataDir);

  const serverUrl = flags.token ? args[0] : undefined;
  const token = flags.token;

  if (!serverUrl || !token) {
    console.error("Usage: ap join <url> --token <tok>");
    process.exit(1);
  }

  const agentConfigPath = join(config.dataDir, "agent.json");
  const agentConfig = {
    serverUrl,
    token,
    enrolledAt: new Date().toISOString(),
  };

  writeFileSync(agentConfigPath, JSON.stringify(agentConfig, null, 2), {
    mode: 0o600,
  });
  chmodSync(agentConfigPath, 0o600);
  console.log("Agent enrolled");
}

async function handleAgent(args: string[]): Promise<void> {
  const config = resolveConfig(args, "agent");
  ensureDataDir(config.dataDir);

  await startFleetAgent(config);
}

function handleUi(args: string[]): void {
  const config = resolveConfig(args);
  const url = `http://localhost:${config.port}`;
  const opened = openBrowser(url);
  if (!opened) {
    console.error(`Could not open browser. Open manually: ${url}`);
    process.exit(1);
  }
}

async function handleDoctor(): Promise<void> {
  console.log("Running capability diagnostics...\n");

  const caps = await probeCapabilities();

  const check = (label: string, ok: boolean, hint?: string) => {
    const icon = ok ? "✓" : "✗";
    const color = ok ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";
    console.log(`  ${color}${icon}${reset} ${label}`);
    if (!ok && hint) {
      console.log(`    → ${hint}`);
    }
  };

  console.log("System:");
  check(`OS: ${caps.os} (${caps.arch})`, true);
  check(
    `Display server: ${caps.display}`,
    caps.display !== "none",
    caps.display === "none"
      ? "No display server detected. Vision/input nodes will not work."
      : undefined,
  );

  console.log("\nScreen capture:");
  const hasScreenshot = caps.screen;
  check(
    "Screenshot capability",
    hasScreenshot,
    caps.display === "wayland"
      ? "Install the desktop portal backend, GStreamer (PipeWire plugin), and ImageMagick. Allow screen sharing when prompted."
      : "Install maim (or scrot/ImageMagick), xdotool, and wmctrl in an X11 desktop session.",
  );
  console.log("\nInput control:");
  check(
    `Input method: ${caps.input}`,
    caps.input !== "none",
    caps.display === "wayland"
      ? "Enable a GNOME/KDE RemoteDesktop portal backend. The session must grant input permission."
      : "Install xdotool for X11 input control.",
  );
  console.log("\nOCR:");
  check("Offline English OCR (bundled WASM fallback)", true);
  check(
    "System tesseract (optional faster engine)",
    caps.tools.includes("tesseract"),
    "apt install tesseract-ocr",
  );
  console.log("\nWindow management:");
  if (caps.display === "x11")
    check(
      "wmctrl + xdotool",
      caps.tools.includes("wmctrl") && caps.tools.includes("xdotool"),
      "apt install wmctrl xdotool",
    );
  if (caps.display === "wayland")
    console.log(
      "  Title/PID targeting requires the GNOME extension or KDE script in desktop/adapters. Other compositors are unsupported.",
    );
  console.log("\nImage matching:");
  check(
    "ImageMagick compare",
    caps.tools.includes("compare"),
    "apt install imagemagick",
  );
  console.log(
    "\nGPU:",
    caps.gpu === true ? "detected" : caps.gpu === false ? "none" : "unknown",
  );

  const issues = [];
  if (caps.display === "none") issues.push("No display server");
  if (!hasScreenshot) issues.push("No screenshot tool");
  if (caps.input === "none" && caps.display !== "none")
    issues.push("No input control tool");

  if (issues.length === 0) {
    console.log("\n\x1b[32mAll checks passed!\x1b[0m");
  } else {
    console.log(`\n\x1b[33m${issues.length} issue(s) found:\x1b[0m`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
}

function handleInstallService(): void {
  const isSystemd = existsSync("/run/systemd/system");
  if (!isSystemd) {
    console.error("systemd not detected. Only systemd is supported currently.");
    process.exit(1);
  }

  const binPath = process.execPath;
  const dataDir = join(process.env.HOME ?? "/root", ".local", "share", "ap");

  const unit = `[Unit]
Description=Automation Platform (ap)
After=network.target

[Service]
Type=simple
ExecStart=${binPath} serve --no-browser
Restart=on-failure
RestartSec=5
Environment=HOME=${process.env.HOME}

[Install]
WantedBy=default.target
`;

  const unitName = "ap.service";
  const systemdDir = join(
    process.env.HOME ?? "/root",
    ".config",
    "systemd",
    "user",
  );
  mkdirSync(systemdDir, { recursive: true });
  const unitPath = join(systemdDir, unitName);
  writeFileSync(unitPath, unit, "utf-8");

  console.log(`Systemd unit written to ${unitPath}`);
  console.log(`\nTo enable and start:`);
  console.log(`  systemctl --user daemon-reload`);
  console.log(`  systemctl --user enable --now ${unitName}`);
  console.log(`\nTo enable lingering (start at boot without login):`);
  console.log(`  loginctl enable-linger $(whoami)`);
}

export function parseArgs(argv: string[]): void {
  const flags = parseCliFlags(argv);
  const args = flags.rest;
  const subcommand = args[0];

  switch (subcommand) {
    case "serve": {
      const config = resolveConfig(argv, "platform");
      startServer(config, flags.pluginsDir);
      break;
    }

    case "join": {
      const joinArgs = args.slice(1);
      handleJoin(joinArgs, { token: flags.token });
      break;
    }

    case "agent": {
      const agentArgs = args.slice(1);
      handleAgent(agentArgs);
      break;
    }

    case "ui": {
      const uiArgs = args.slice(1).filter((a) => !a.startsWith("--token"));
      handleUi(uiArgs);
      break;
    }

    case "doctor": {
      handleDoctor();
      break;
    }

    case "install-service": {
      handleInstallService();
      break;
    }

    case undefined: {
      const config = resolveConfig(argv, "standalone");
      startServer(config, flags.pluginsDir);
      break;
    }

    default: {
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error(
        "Usage: ap [serve] [--port N] [--public-url URL] [--no-browser] | ap join <url> --token <tok> | ap agent | ap ui | ap doctor | ap install-service",
      );
      process.exit(1);
    }
  }
}
