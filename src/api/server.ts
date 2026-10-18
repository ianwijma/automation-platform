import { bundledFile, installBundledHelper } from "../core/bundled-assets.js";
import { createRequestGuard } from "./security.js";
import { TriggerManager } from "./trigger-manager.js";
import { probeCapabilities } from "../agent/capability-probe.js";
import { resolve, extname, join, relative } from "node:path";
import { statSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import type { AppConfig } from "../cli/config.js";
import type { SystemInfoResponse } from "../core/api-types.js";
import type { AppDatabase } from "../db/database.js";
import { FleetDispatcher } from "../agent/fleet-dispatcher.js";
import { WssHub } from "./wss-hub.js";
import { ArtifactStore } from "./artifacts.js";
import { CredentialVault } from "../core/credential-vault.js";
import { EnvResolver } from "../core/env-resolver.js";
import { handleApiRoute } from "./routes.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const CORS_HEADERS: Record<string, string> = {};

const UI_DIST_DEFAULT = resolve(import.meta.dir, "../../ui/dist");

const START_TIME = Date.now();

function mimeTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function serveStaticFile(filePath: string): Response | null {
  if (!existsSync(filePath)) return null;

  const stat = statSync(filePath);
  if (!stat.isFile()) return null;

  const body = readFileSync(filePath);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": mimeTypeFor(filePath),
      "Cache-Control": "public, max-age=3600",
      ...CORS_HEADERS,
    },
  });
}

interface WsData {
  connectedAt: number;
  agentId: string | null;
}

interface ServerResult {
  server: ReturnType<typeof Bun.serve<WsData>>;
  close: () => Promise<void>;
}

export function createServer(options: {
  port: number;
  host: string;
  db: AppDatabase;
  config: AppConfig;
  uiDist?: string;
}): ServerResult {
  const { port, host, db, config } = options;
  installBundledHelper(config.dataDir);
  const guard = createRequestGuard({ ...config, host });
  const UI_DIST = options.uiDist ?? process.env.AP_UI_DIST ?? UI_DIST_DEFAULT;

  const hub = new WssHub(db.db);
  const artifactStore = new ArtifactStore(config.dataDir, db.db);
  hub.artifactStore = artifactStore;
  const vault = new CredentialVault(db);
  const envResolver = new EnvResolver(db, vault);
  const fleetDispatcher = new FleetDispatcher(
    hub,
    vault,
    envResolver,
    artifactStore,
  );

  fleetDispatcher.attachDatabase(db.db);
  const triggers = new TriggerManager(db.db, fleetDispatcher);
  triggers.start();
  const gcTimer = setInterval(() => artifactStore.cleanupExpired(), 60_000);
  artifactStore.cleanupExpired();
  let stopped = false;
  void probeCapabilities()
    .then((caps) => {
      if (!stopped) fleetDispatcher.registerLocalCapabilities(caps);
    })
    .catch((error) => console.error("Capability probe failed:", error.message));
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

  hub.onMessage((agentId, msg) => {
    const conn = hub.getAgentConnection(agentId);
    if (conn) {
      fleetDispatcher.registerRemoteAgent(
        agentId,
        conn.name,
        conn.capabilities,
        conn.tags,
      );
    }
  });

  const server = Bun.serve<WsData>({
    port,
    hostname: host,
    maxRequestBodySize: 32 * 1024 * 1024,
    fetch(req: Request, server): Response | Promise<Response> {
      const denied = guard(req);
      if (denied) return denied;
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (
        pathname === "/api/agent/connect" &&
        req.headers.get("upgrade")?.toLowerCase() === "websocket"
      ) {
        const success = server.upgrade(req, {
          data: { connectedAt: Date.now(), agentId: null },
        });
        if (success) return undefined as any;
        return json({ error: "WebSocket upgrade failed" }, 500);
      }

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (req.method === "GET" && pathname === "/api/system/info") {
        const uptime = Math.floor((Date.now() - START_TIME) / 1000);
        const info: SystemInfoResponse = {
          version: "0.1.0",
          mode: config.mode,
          uptime,
        };
        return json(info);
      }

      if (pathname.startsWith("/api/") || pathname.startsWith("/hooks/")) {
        if (pathname === "/api/triggers/status" && req.method === "GET")
          return json(
            [...triggers.errors].map(([id, error]) => ({ id, error })),
          );
        const result = handleApiRoute(
          db.db,
          fleetDispatcher,
          req,
          fleetDispatcher,
          hub,
          artifactStore,
          db,
          vault,
          envResolver,
        );
        if (result !== null) return result;
        return json({ error: "Not found" }, 404);
      }

      if (req.method === "GET") {
        if (!options.uiDist && !process.env.AP_UI_DIST) {
          const asset =
            bundledFile(`ui${pathname === "/" ? "/index.html" : pathname}`) ??
            (!extname(pathname) ? bundledFile("ui/index.html") : undefined);
          if (asset)
            return new Response(asset as Uint8Array<ArrayBuffer>, {
              headers: {
                "Content-Type": mimeTypeFor(
                  pathname === "/" || !extname(pathname)
                    ? "index.html"
                    : pathname,
                ),
                "X-Content-Type-Options": "nosniff",
              },
            });
        }
        const safePath = join(UI_DIST, relative("/", pathname) || "index.html");
        const resolvedPath = resolve(safePath);

        if (!resolvedPath.startsWith(resolve(UI_DIST) + "/")) {
          return json({ error: "Not found" }, 404);
        }

        const fileResponse = serveStaticFile(resolvedPath);
        if (fileResponse) return fileResponse;

        const indexPath = resolve(join(UI_DIST, "index.html"));
        const indexResponse = serveStaticFile(indexPath);
        if (indexResponse) return indexResponse;

        return json({ error: "Not found" }, 404);
      }

      return json({ error: "Not found" }, 404);
    },
    websocket: {
      maxPayloadLength: 48 * 1024 * 1024,
      open(ws) {
        hub.handleOpen(ws);
      },
      message(ws, message) {
        hub.handleMessage(ws, message as string | Buffer);
      },
      close(ws) {
        hub.handleClose(ws);
      },
    },
  });

  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      process.removeListener("SIGTERM", shutdown);
      process.removeListener("SIGINT", shutdown);
      stopped = true;
      triggers.stop();
      clearInterval(gcTimer);
      await fleetDispatcher.shutdown();
      hub.close();
      // Bun 1.3 can leave stop() pending after a WebSocket close handshake.
      // stop(true) stops accepting requests immediately; all dispatch work is drained above.
      await Promise.race([
        server.stop(true),
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]);
      db.close();
    })());
  const shutdown = () => {
    void close().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return { server, close };
}
