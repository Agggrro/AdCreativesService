/**
 * Module resolution hooks that let a plain `node` script import the app's own
 * TypeScript modules, instead of keeping a second copy of their logic.
 *
 * Two things in app code that Node cannot resolve on its own, both supplied by
 * Next's bundler rather than by node_modules:
 *
 *   - `@/…` path aliases (tsconfig `paths`), which Node does not read.
 *   - `server-only`, which is not an installed package at all. Next aliases it
 *     during the build; here it becomes an empty module. That is the same thing
 *     the `react-server` export condition does, and it is sound for a script:
 *     the marker exists to keep server code out of a *client bundle*, and a CLI
 *     process has no client bundle to leak into.
 *
 * Node still does the TypeScript type-stripping itself (v22.18+/v24 do this by
 * default), so nothing here compiles anything.
 *
 * Registered by scripts/register-app-imports.mjs — see `npm run snapshot:backfill`.
 */
import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** An alias may name a file with an implied extension, or a directory index. */
const CANDIDATES = ["", ".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}


export async function resolve(specifier, context, next) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: "data:text/javascript,export {}", shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    const base = join(root, specifier.slice(2));
    for (const suffix of CANDIDATES) {
      const candidate = `${base}${suffix}`;
      if (isFile(candidate)) {
        return next(
          pathToFileURL(candidate).href,
          context,
        );
      }
    }
    throw new Error(
      `Could not resolve "${specifier}" under ${root}. ` +
        "The alias hook tries the path as-is, then .ts/.tsx/.mts/.js and /index.ts.",
    );
  }

  // Relative imports written without an extension (`./index`, `./store`). Node's
  // ESM resolver requires one; the app is written for a bundler that does not.
  // Only consulted after the plain resolution has actually failed, so a real
  // file always wins.
  if (specifier.startsWith(".")) {
    try {
      return await next(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND" || !context.parentURL) throw err;
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      for (const suffix of CANDIDATES) {
        const candidate = `${base}${suffix}`;
        if (isFile(candidate)) {
          return next(pathToFileURL(candidate).href, context);
        }
      }
      throw err;
    }
  }

  return next(specifier, context);
}
