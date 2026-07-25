import { resolve, extname, join, relative } from "node:path";
import { statSync, readFileSync, existsSync } from "node:fs";
import type { AppConfig } from "../cli/config.js";
import type { SystemInfoResponse } from "../core/api-types.js";
import type { AppDatabase } from "../db/database.js";
import { AgentDispatcher } from "../agent/dispatcher.js";
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

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const UI_DIST = resolve(import.meta.dir, "../../ui/dist");

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

interface ServerResult {
  server: ReturnType<typeof Bun.serve>;
  close: () => void;
}

export function createServer(options: {
  port: number;
  host: string;
  db: AppDatabase;
  config: AppConfig;
}): ServerResult {
  const { port, host, db, config } = options;
  const dispatcher = new AgentDispatcher();

  const server = Bun.serve({
    port,
    hostname: host,
    fetch(req: Request): Response | Promise<Response> {
      const url = new URL(req.url);
      const pathname = url.pathname;

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

      if (pathname.startsWith("/api/")) {
        const result = handleApiRoute(db.db, dispatcher, req);
        if (result !== null) return result;
        return json({ error: "Not found" }, 404);
      }

      if (req.method === "GET") {
        const safePath = join(UI_DIST, relative("/", pathname) || "index.html");
        const resolvedPath = resolve(safePath);

        if (!resolvedPath.startsWith(UI_DIST)) {
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
  });

  const close = () => {
    server.stop();
    db.close();
  };

  process.on("SIGTERM", () => {
    close();
    process.exit(0);
  });

  return { server, close };
}
