import { timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../cli/config.js";
export function isLoopback(host: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
}
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function createRequestGuard(config: AppConfig) {
  const adminToken = process.env.AP_ADMIN_TOKEN;
  if (!isLoopback(config.host) && (!adminToken || adminToken.length < 32))
    throw new Error(
      "Network binding requires AP_ADMIN_TOKEN (at least 32 characters)",
    );
  if (!isLoopback(config.host) && !config.publicUrl?.startsWith("https://"))
    throw new Error(
      "Network binding requires an HTTPS AP_PUBLIC_URL behind a TLS reverse proxy",
    );
  const publicOrigin = config.publicUrl
    ? new URL(config.publicUrl).origin
    : null;
  return (req: Request): Response | null => {
    const url = new URL(req.url),
      origin = req.headers.get("Origin");
    const allowedHost =
      isLoopback(url.hostname) ||
      (config.publicUrl && url.host === new URL(config.publicUrl).host) ||
      (!isLoopback(config.host) && url.hostname === config.host);
    if (!allowedHost)
      return Response.json({ error: "Untrusted Host" }, { status: 403 });
    if (origin && origin !== url.origin && origin !== publicOrigin)
      return Response.json({ error: "Untrusted Origin" }, { status: 403 });
    if (req.headers.get("sec-fetch-site") === "cross-site")
      return Response.json(
        { error: "Cross-site request denied" },
        { status: 403 },
      );
    // The agent socket uses its own enrollment/identity protocol. Webhook paths are explicit public triggers.
    if (
      url.pathname === "/api/agent/connect" ||
      url.pathname.startsWith("/hooks/")
    )
      return null;
    if (
      !url.pathname.startsWith("/api/") ||
      url.pathname === "/api/system/info"
    )
      return null;
    if (adminToken) {
      const cookie = req.headers
        .get("cookie")
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("ap_session="))
        ?.slice(11);
      const presented =
        req.headers.get("authorization")?.replace(/^Bearer /, "") ??
        cookie ??
        "";
      if (!equal(presented, adminToken))
        return Response.json(
          { error: "Authentication required" },
          { status: 401 },
        );
    }
    return null;
  };
}
