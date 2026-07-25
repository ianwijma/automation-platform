import { spawnSync } from "node:child_process";

const BROWSER_CANDIDATES = ["xdg-open", "sensible-browser", "firefox", "chromium"];

export function openBrowser(url: string): boolean {
  for (const candidate of BROWSER_CANDIDATES) {
    const result = spawnSync(candidate, [url], {
      stdio: "ignore",
      timeout: 5000,
    });
    if (result.status === 0) return true;
  }
  return false;
}
