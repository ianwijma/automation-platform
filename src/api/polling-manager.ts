import type { Database } from "bun:sqlite";
import type { AgentDispatcher } from "../agent/dispatcher.js";
import type { RunOptions } from "../core/execution-engine.js";
import type { NodeItem } from "../core/node-contract.js";
import { getAutomation } from "./automations.js";
import { runAutomation } from "./runs.js";

interface PollingEntry {
  automationId: string;
  intervalSec: number;
  targetType: string;
  target: string;
  stopAfter: number;
  pollCount: number;
  lastHash: string | null;
  timer: ReturnType<typeof setInterval> | null;
  db: Database;
  dispatcher: AgentDispatcher;
}

const activePolls = new Map<string, PollingEntry>();

async function executePoll(targetType: string, target: string): Promise<Record<string, unknown>> {
  if (targetType === "url") {
    const response = await fetch(target);
    const body = await response.text();
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    };
  }

  if (targetType === "command") {
    const proc = Bun.spawn(target.split(/\s+/), {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return {
      exitCode,
      stdout,
      stderr,
    };
  }

  throw new Error(`Unknown polling targetType: ${targetType}`);
}

function hashResult(result: Record<string, unknown>): string {
  const json = JSON.stringify(result);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(16);
}

async function pollCycle(entry: PollingEntry): Promise<void> {
  entry.pollCount++;

  if (entry.stopAfter > 0 && entry.pollCount > entry.stopAfter) {
    stopPolling(entry.automationId);
    return;
  }

  try {
    const result = await executePoll(entry.targetType, entry.target);
    const newHash = hashResult(result);

    if (entry.lastHash !== null && entry.lastHash === newHash) {
      return;
    }

    entry.lastHash = newHash;

    const automation = getAutomation(entry.db, entry.automationId);
    if (!automation || !automation.activeVersionId) {
      stopPolling(entry.automationId);
      return;
    }

    const triggerData: NodeItem[] = [
      {
        json: {
          triggeredAt: new Date().toISOString(),
          targetType: entry.targetType,
          target: entry.target,
          result,
          pollCount: entry.pollCount,
        },
      },
    ];

    const options: RunOptions = {
      mode: "trigger",
      triggerData,
    };

    await runAutomation(entry.db, entry.dispatcher, entry.automationId, options);
  } catch {
    // swallow errors to keep polling alive
  }
}

export function startPolling(
  automationId: string,
  config: {
    intervalSec: number;
    targetType: string;
    target: string;
    stopAfter: number;
  },
  db: Database,
  dispatcher: AgentDispatcher,
): void {
  if (activePolls.has(automationId)) {
    stopPolling(automationId);
  }

  const entry: PollingEntry = {
    automationId,
    intervalSec: config.intervalSec,
    targetType: config.targetType,
    target: config.target,
    stopAfter: config.stopAfter,
    pollCount: 0,
    lastHash: null,
    timer: null,
    db,
    dispatcher,
  };

  entry.timer = setInterval(() => {
    pollCycle(entry);
  }, config.intervalSec * 1000);

  activePolls.set(automationId, entry);

  pollCycle(entry);
}

export function stopPolling(automationId: string): void {
  const entry = activePolls.get(automationId);
  if (entry?.timer !== null && entry?.timer !== undefined) {
    clearInterval(entry.timer);
  }
  activePolls.delete(automationId);
}

export function isPolling(automationId: string): boolean {
  return activePolls.has(automationId);
}

export function getPollInfo(automationId: string): { pollCount: number; lastHash: string | null } | null {
  const entry = activePolls.get(automationId);
  if (!entry) return null;
  return { pollCount: entry.pollCount, lastHash: entry.lastHash };
}

export function clearAllPolls(): void {
  for (const entry of activePolls.values()) {
    if (entry.timer !== null) {
      clearInterval(entry.timer);
    }
  }
  activePolls.clear();
}
