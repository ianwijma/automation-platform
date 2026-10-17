import { existsSync, readdirSync } from "node:fs";
export class PluginLoader {
  async loadFromDir(path: string): Promise<void> {
    if (existsSync(path) && readdirSync(path).length)
      throw new Error(
        "Third-party plugins are disabled until the isolated plugin runtime is available",
      );
  }
  async loadPlugin(_path: string): Promise<never> {
    throw new Error(
      "Third-party plugins are disabled until the isolated plugin runtime is available",
    );
  }
  getLoaded(): never[] {
    return [];
  }
  getPluginNames(): string[] {
    return [];
  }
}
export async function loadPlugins(path?: string): Promise<PluginLoader> {
  const loader = new PluginLoader();
  if (path) await loader.loadFromDir(path);
  return loader;
}
