import { Cron } from "croner";
import type { Database } from "bun:sqlite";
import type { AgentDispatcher } from "../agent/dispatcher.js";
import { validateDefinition } from "../core/schemas.js";
import { runAutomation } from "./runs.js";

/** Owns background work for one server; no process-global timers. */
export class TriggerManager {
  private jobs = new Map<string, { version: string; stop(): void }>();
  private busy = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  readonly errors = new Map<string, string>();
  constructor(
    private db: Database,
    private dispatcher: AgentDispatcher,
  ) {}
  start(): void {
    this.sync();
    this.timer = setInterval(() => this.sync(), 1000);
  }
  sync(): void {
    const wanted = new Set<string>();
    const rows = this.db
      .query<
        { id: string; active_version_id: string; definition_json: string },
        []
      >("SELECT a.id,a.active_version_id,v.definition_json FROM automations a JOIN automation_versions v ON v.id=a.active_version_id")
      .all();
    for (const row of rows) {
      try {
        const definition = validateDefinition(JSON.parse(row.definition_json));
        for (const node of definition.nodes.filter(
          (n) =>
            !n.disabled &&
            ["trigger.schedule", "trigger.polling"].includes(n.type),
        )) {
          const key = `${row.id}:${node.id}`;
          wanted.add(key);
          if (this.jobs.get(key)?.version === row.active_version_id) continue;
          this.jobs.get(key)?.stop();
          this.errors.delete(key);
          const fire = async () => {
            if (this.busy.has(key)) return;
            const active = this.db
              .query<
                { active_version_id: string },
                [string]
              >("SELECT active_version_id FROM automations WHERE id=?")
              .get(row.id);
            if (active?.active_version_id !== row.active_version_id) return;
            if (
              node.type === "trigger.polling" &&
              Number(node.params.stopAfter) > 0 &&
              Number(
                this.dispatcher.getState(row.id, `polling:${node.id}:count`) ??
                  0,
              ) >= Number(node.params.stopAfter)
            ) {
              this.jobs.get(key)?.stop();
              return;
            }
            if (node.type === "trigger.schedule") {
              const stamp = String(Math.floor(Date.now() / 1000));
              const cursorKey = `${key}:${row.active_version_id}`;
              const previous = this.db
                .query<
                  { value: string },
                  [string]
                >("SELECT value FROM trigger_cursors WHERE key=?")
                .get(cursorKey);
              if (previous?.value === stamp) return;
              this.db
                .prepare(
                  "INSERT INTO trigger_cursors(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                )
                .run(cursorKey, stamp);
            }
            this.busy.add(key);
            try {
              const run = await runAutomation(
                this.db,
                this.dispatcher,
                row.id,
                { mode: "trigger", triggerNodeId: node.id },
              );
              if (run?.error) this.errors.set(key, run.error);
              else this.errors.delete(key);
            } catch (error) {
              this.errors.set(key, String(error));
            } finally {
              this.busy.delete(key);
            }
          };
          if (node.type === "trigger.schedule") {
            const cron = new Cron(
              String(node.params.cron),
              {
                timezone: String(node.params.timezone ?? "UTC"),
                protect: true,
              },
              fire,
            );
            this.jobs.set(key, {
              version: row.active_version_id,
              stop: () => cron.stop(),
            });
          } else {
            const seconds = Number(node.params.intervalSec ?? 60);
            if (!Number.isFinite(seconds) || seconds < 0.1)
              throw new Error("Polling interval must be at least 0.1 seconds");
            const timer = setInterval(() => void fire(), seconds * 1000);
            this.jobs.set(key, {
              version: row.active_version_id,
              stop: () => clearInterval(timer),
            });
          }
        }
      } catch (error) {
        this.errors.set(row.id, String(error));
      }
    }
    for (const [key, job] of this.jobs)
      if (!wanted.has(key)) {
        job.stop();
        this.jobs.delete(key);
      }
    for (const key of this.errors.keys())
      if (!wanted.has(key) && !rows.some((row) => row.id === key))
        this.errors.delete(key);
  }
  stop(): void {
    clearInterval(this.timer);
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }
}
