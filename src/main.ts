import { parseArgs } from "./cli/index.js";
import "./nodes/index.js";

parseArgs(process.argv.slice(2));
