/**
 * Registers scripts/app-imports-hook.mjs. Used as `node --import
 * ./scripts/register-app-imports.mjs …` so the hooks are installed before the
 * entry module is loaded — a plain import inside the script would run too late
 * for its own import graph.
 */
import { register } from "node:module";

register("./app-imports-hook.mjs", import.meta.url);
