import { parseCliFlags } from "./flags.js";

export interface AppConfig {
  mode: "standalone" | "platform" | "agent";
  port: number;
  host: string;
  dataDir: string;
  publicUrl: string | null;
  noBrowser: boolean;
  dbPath: string;
}

const DEFAULT_PORT = 7480;
const DEFAULT_STANDALONE_HOST = "127.0.0.1";
const DEFAULT_PLATFORM_HOST = "0.0.0.0";
const DEFAULT_DATA_DIR = "~/.config/ap";

function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return `${process.env.HOME || "/tmp"}${path.slice(1)}`;
  }
  return path;
}

function envString(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function envInt(key: string): number | undefined {
  const raw = envString(key);
  if (raw === undefined) return undefined;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

function envBool(key: string): boolean | undefined {
  const raw = envString(key);
  if (raw === undefined) return undefined;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

export function resolveConfig(
  args: string[],
  subcommand?: "standalone" | "platform" | "agent",
): AppConfig {
  const flags = parseCliFlags(args);

  let mode: AppConfig["mode"] = "standalone";
  if (subcommand === "platform" || subcommand === "agent") {
    mode = subcommand;
  }

  const envPublicUrl = envString("AP_PUBLIC_URL");
  const effectivePublicUrl = flags.publicUrl ?? envPublicUrl ?? null;

  if (mode === "standalone" && effectivePublicUrl !== null) {
    mode = "platform";
  }

  const port = flags.port ?? envInt("AP_PORT") ?? DEFAULT_PORT;

  const envHost = envString("AP_HOST");
  let host: string;
  if (envHost !== undefined) {
    host = envHost;
  } else if (mode === "platform" || mode === "agent") {
    host = DEFAULT_PLATFORM_HOST;
  } else {
    host = DEFAULT_STANDALONE_HOST;
  }

  const envDataDir = envString("AP_DATA_DIR");
  const dataDir = expandHome(envDataDir ?? DEFAULT_DATA_DIR);

  const noBrowser = flags.noBrowser ?? envBool("AP_NO_BROWSER") ?? false;

  const dbPath = `${dataDir}/ap.db`;

  return {
    mode,
    port,
    host,
    dataDir,
    publicUrl: effectivePublicUrl,
    noBrowser,
    dbPath,
  };
}
