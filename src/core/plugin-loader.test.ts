import { expect, test } from "bun:test";
import { PluginLoader } from "./plugin-loader.js";
test("third-party code cannot be imported into the platform process", async () => {
  const loader = new PluginLoader();
  await expect(loader.loadPlugin("/tmp/untrusted-plugin")).rejects.toThrow(
    "disabled",
  );
  expect(loader.getLoaded()).toEqual([]);
});
