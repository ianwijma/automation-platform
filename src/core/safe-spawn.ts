import { executionSignal } from "./cancellation.js";
import type { Subprocess } from "bun";

interface SpawnOptions {
  cmd: string[];
  stdout?: "pipe" | "inherit" | "ignore";
  stderr?: "pipe" | "inherit" | "ignore";
  stdin?: "pipe" | "inherit" | "ignore";
  env?: Record<string, string>;
  cwd?: string;
  detached?: boolean;
  signal?: AbortSignal;
}

function isNotFoundError(err: unknown): boolean {
  const msg = (err as Error).message ?? "";
  return (
    msg.includes("$PATH") ||
    msg.includes("not found") ||
    msg.includes("ENOENT") ||
    msg.includes("spawn")
  );
}

export async function safeSpawn(opts: SpawnOptions): Promise<Subprocess> {
  try {
    const signal = opts.signal ?? executionSignal.getStore();
    signal?.throwIfAborted();
    const proc = Bun.spawn(opts.cmd, {
      stdout: opts.stdout ?? "pipe",
      stderr: opts.stderr ?? "pipe",
      stdin: opts.stdin,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) =>
            /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_.*|TZ|TERM|TMPDIR|DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|XDG_.*|AP_DESKTOP_BRIDGE)$/.test(
              key,
            ),
          ),
        ),
        ...opts.env,
      },
      cwd: opts.cwd,
      detached: opts.detached ?? !!signal,
    });
    const abort = () => {
      try {
        if ((opts.detached ?? !!signal) && process.platform !== "win32")
          process.kill(-proc.pid, "SIGKILL");
        else proc.kill("SIGKILL");
      } catch {}
    };
    signal?.addEventListener("abort", abort, { once: true });
    void proc.exited.finally(() => signal?.removeEventListener("abort", abort));
    return proc;
  } catch (spawnErr) {
    if (isNotFoundError(spawnErr)) {
      const tool = opts.cmd[0];
      const hints: Record<string, string> = {
        xdotool: "apt install xdotool / pacman -S xdotool",
        ydotool: "Install ydotool: https://github.com/ReimuNotMoe/ydotool",
        tesseract: "apt install tesseract-ocr / pacman -S tesseract",
        maim: "apt install maim / pacman -S maim",
        scrot: "apt install scrot / pacman -S scrot",
        grim: "pacman -S grim / swaymsg -S grim",
        import: "apt install imagemagick / pacman -S imagemagick",
        wmctrl: "apt install wmctrl / pacman -S wmctrl",
        xwininfo: "apt install x11-utils / pacman -S xorg-xwininfo",
        hyprctl: "Included with Hyprland",
        swaymsg: "Included with Sway",
        slurp: "pacman -S slurp / swaymsg -S slurp",
        compare: "apt install imagemagick / pacman -S imagemagick",
      };
      const hint = hints[tool] ?? `Ensure '${tool}' is installed and in $PATH`;
      throw new Error(`${tool} is not installed. ${hint}`);
    }
    throw spawnErr;
  }
}

export async function readProcessOutput(
  output: Subprocess["stdout"] | Subprocess["stderr"],
): Promise<string> {
  if (output === undefined || typeof output === "number") return "";
  const reader = output.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024)
        throw new Error(
          "Process output exceeded 8 MiB; write large results to a file artifact",
        );
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}

export async function spawnAndCapture(opts: SpawnOptions): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = await safeSpawn(opts);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      readProcessOutput(proc.stdout),
      readProcessOutput(proc.stderr),
    ]);
    return { exitCode, stdout, stderr };
  } catch (error) {
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill("SIGKILL");
    }
    throw error;
  }
}
