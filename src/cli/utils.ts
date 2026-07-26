import { spawnSync } from "node:child_process";

const DEFAULT_CANDIDATES = ["xdg-open", "sensible-browser", "firefox", "chromium"];

export function openBrowser(url: string, candidates?: string[]): boolean {
  const list = candidates ?? DEFAULT_CANDIDATES;
  for (const candidate of list) {
    const result = spawnSync(candidate, [url], {
      stdio: "ignore",
      timeout: 5000,
    });
    if (result.status === 0) return true;
  }
  return false;
}
