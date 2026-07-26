import type { Subprocess } from "bun";

interface SpawnOptions {
  cmd: string[];
  stdout?: "pipe" | "inherit" | "ignore";
  stderr?: "pipe" | "inherit" | "ignore";
  stdin?: "pipe" | "inherit" | "ignore";
  env?: Record<string, string>;
  cwd?: string;
  detached?: boolean;
}

function isNotFoundError(err: unknown): boolean {
  const msg = (err as Error).message ?? "";
  return msg.includes("$PATH") || msg.includes("not found") || msg.includes("ENOENT") || msg.includes("spawn");
}

export async function safeSpawn(opts: SpawnOptions): Promise<Subprocess> {
  try {
    return Bun.spawn(opts.cmd, {
      stdout: opts.stdout ?? "pipe",
      stderr: opts.stderr ?? "pipe",
      stdin: opts.stdin,
      env: opts.env,
      cwd: opts.cwd,
      detached: opts.detached,
    });
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

export async function spawnAndCapture(opts: SpawnOptions): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = await safeSpawn(opts);
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}
