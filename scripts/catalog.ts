import "../src/nodes/index.js";
import { nodeCatalog } from "../src/core/schemas.js";
await Bun.write(
  new URL("../ui/src/node-catalog.json", import.meta.url),
  JSON.stringify(nodeCatalog(), null, 2) + "\n",
);
