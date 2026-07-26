interface CronField {
  type: "wildcard" | "step" | "specific";
  values: number[];
  step: number;
}

function parseCronField(field: string, min: number, max: number): CronField {
  if (field === "*") {
    return { type: "wildcard", values: [], step: 1 };
  }

  if (field.includes("/")) {
    const parts = field.split("/");
    const base = parts[0];
    const step = parseInt(parts[1], 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${field}`);
    }

    let values: number[];
    if (base === "*") {
      values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    } else {
      values = base.split(",").map((v) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < min || n > max) {
          throw new Error(`Invalid cron value: ${v} (range ${min}-${max})`);
        }
        return n;
      });
    }

    const filtered = values.filter((v) => (v - min) % step === 0);
    return { type: "step", values: filtered, step };
  }

  if (field.includes(",")) {
    const values = field.split(",").map((v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n < min || n > max) {
        throw new Error(`Invalid cron value: ${v} (range ${min}-${max})`);
      }
      return n;
    });
    return { type: "specific", values, step: 1 };
  }

  const n = parseInt(field, 10);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`Invalid cron value: ${field} (range ${min}-${max})`);
  }
  return { type: "specific", values: [n], step: 1 };
}

export interface ParsedCron {
  minute: CronField;
  hour: CronField;
  day: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

export function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${expression}"`);
  }

  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    day: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6),
  };
}

function fieldMatches(field: CronField, value: number): boolean {
  if (field.type === "wildcard") {
    if (field.step > 1) {
      return value % field.step === 0;
    }
    return true;
  }

  return field.values.includes(value);
}

export function cronMatches(parsed: ParsedCron, date: Date): boolean {
  return (
    fieldMatches(parsed.minute, date.getMinutes()) &&
    fieldMatches(parsed.hour, date.getHours()) &&
    fieldMatches(parsed.day, date.getDate()) &&
    fieldMatches(parsed.month, date.getMonth() + 1) &&
    fieldMatches(parsed.dayOfWeek, date.getDay())
  );
}

interface ScheduleEntry {
  automationId: string;
  cron: ParsedCron;
  timezone: string;
  callback: () => void;
  lastFiredMinute: number;
}

export class Scheduler {
  private schedules = new Map<string, ScheduleEntry>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  addSchedule(automationId: string, cron: string, timezone: string, callback: () => void): void {
    const parsed = parseCron(cron);
    this.schedules.set(automationId, {
      automationId,
      cron: parsed,
      timezone,
      callback,
      lastFiredMinute: -1,
    });
  }

  removeSchedule(automationId: string): void {
    this.schedules.delete(automationId);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  private tick(): void {
    const now = new Date();
    const currentMinute = now.getMinutes() + now.getHours() * 60;

    for (const entry of this.schedules.values()) {
      if (entry.lastFiredMinute === currentMinute) {
        continue;
      }

      if (cronMatches(entry.cron, now)) {
        entry.lastFiredMinute = currentMinute;
        try {
          entry.callback();
        } catch {
          // swallow errors to keep the scheduler loop alive
        }
      }
    }
  }

  getScheduleCount(): number {
    return this.schedules.size;
  }
}
