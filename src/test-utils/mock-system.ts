import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC",
  "base64",
);

export class MockSystemTools {
  public binDir: string;

  constructor() {
    this.binDir = `/tmp/ap-test-bin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    mkdirSync(this.binDir, { recursive: true });
  }

  addTool(name: string, exitCode: number, stdout: string, stderr?: string): this {
    const script = `#!/bin/sh
${stderr ? `echo "${stderr.replace(/"/g, '\\"')}" >&2` : ""}
echo "${stdout.replace(/"/g, '\\"')}"
exit ${exitCode}
`;
    writeFileSync(join(this.binDir, name), script, { mode: 0o755 });
    return this;
  }

  addScreenshot(outputPath: string): this {
    const tools = ["maim", "scrot", "import", "grim"];
    for (const tool of tools) {
      const script = `#!/bin/sh
cp /dev/stdin "${outputPath}" 2>/dev/null || cat > "${outputPath}"
`;
      writeFileSync(join(this.binDir, tool), script, { mode: 0o755 });
    }
    const pngPath = join(this.binDir, "_fake_screenshot.png");
    writeFileSync(pngPath, MINIMAL_PNG);
    const screenScript = `#!/bin/sh
cat "${pngPath}" > "${outputPath}"
exit 0
`;
    for (const tool of tools) {
      writeFileSync(join(this.binDir, tool), screenScript, { mode: 0o755 });
    }
    return this;
  }

  addOcr(text: string): this {
    const script = `#!/bin/sh
if [ "$1" = "stdout" ]; then
  echo "${text.replace(/"/g, '\\"')}"
else
  echo "${text.replace(/"/g, '\\"')}" > "$3" 2>/dev/null || echo "${text.replace(/"/g, '\\"')}"
fi
exit 0
`;
    writeFileSync(join(this.binDir, "tesseract"), script, { mode: 0o755 });
    return this;
  }

  addImageMagick(): this {
    const commands = ["convert", "identify", "compare"];
    for (const cmd of commands) {
      const script = `#!/bin/sh
if [ "${cmd}" = "identify" ]; then
  echo "PNG 1x1 1x1+0+0 8-bit sRGB 0B 0.000u 0:00.00"
  exit 0
fi
if [ "${cmd}" = "compare" ]; then
  echo "0"
  exit 0
fi
exit 0
`;
      writeFileSync(join(this.binDir, cmd), script, { mode: 0o755 });
    }
    return this;
  }

  addXdotool(): this {
    const tools = ["xdotool", "ydotool"];
    for (const tool of tools) {
      const script = `#!/bin/sh
echo "mock-${tool}: $*"
exit 0
`;
      writeFileSync(join(this.binDir, tool), script, { mode: 0o755 });
    }
    return this;
  }

  get path(): string {
    return this.binDir;
  }

  cleanup(): void {
    try {
      rmSync(this.binDir, { recursive: true, force: true });
    } catch {}
  }
}
