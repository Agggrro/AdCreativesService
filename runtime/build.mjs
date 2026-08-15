/**
 * AdInteract runtime build. Concatenates the shared VPAID base with each
 * template's render module, then minifies the result (terser: mangle +
 * compress, no control-flow-flattening/self-defending presets — those add
 * runtime overhead that risks tripping player init timeouts, see ADR-0003)
 * into a self-contained unit under runtime/dist/. Upload the dist files to
 * the `creatives` Storage bucket at the paths in each template's
 * runtime_keys. Run: `npm run build:runtime`.
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  existsSync,
  statSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const root = dirname(fileURLToPath(import.meta.url));
const vpaidBase = readFileSync(join(root, "lib", "vpaid-base.js"), "utf8");
const templatesDir = join(root, "templates");

// Start from empty, because dist/ is gitignored and nothing else ever prunes
// it: when shoppable's key moved to vpaid/unit.js, the old dist/shoppable/
// vpaid.js sat there for a month and would have been pushed to the bucket as a
// phantom object by `npm run runtime:push`, which uploads whatever it finds.
const distDir = join(root, "dist");
rmSync(distDir, { recursive: true, force: true });

// Output path relative to dist/<name>/, keyed by template dir name. Every
// template's built unit lands at `dist/<name>/vpaid.js` to match its
// `templates.runtime_keys.vpaid` storage path — except `shoppable`, whose
// key is nested one level deeper (`shoppable/vpaid/unit.js`, predating the
// other four templates' shared-base convention).
const OUTPUT_RELATIVE_PATH = {
  shoppable: "vpaid/unit.js",
};

// mangle (short var/property-ish names) + compress, deliberately WITHOUT
// javascript-obfuscator-style control-flow flattening or self-defending
// code: those add per-init runtime cost that risks tripping VPAID init
// timeouts in players like Google IMA. This only raises the cost of casual
// copying (ADR-0003) — it does not, and is not meant to, make the unit
// unrecoverable.
const MINIFY_OPTIONS = {
  compress: true,
  mangle: true,
  format: { comments: false },
};

let built = 0;
for (const name of readdirSync(templatesDir)) {
  const dir = join(templatesDir, name);
  if (!statSync(dir).isDirectory()) continue;

  const renderPath = join(dir, "vpaid.js");
  if (!existsSync(renderPath)) continue;

  const render = readFileSync(renderPath, "utf8");
  // render defines `var TEMPLATE`; base references it in getVPAIDAd.
  const source = `${render}\n${vpaidBase}`;
  const { code, error } = await minify(source, MINIFY_OPTIONS).then(
    (result) => ({ code: result.code, error: null }),
    (err) => ({ code: null, error: err }),
  );
  if (error) {
    throw new Error(`terser failed to minify ${name}/vpaid.js: ${error.message}`);
  }

  const outRelative = OUTPUT_RELATIVE_PATH[name] || "vpaid.js";
  const outPath = join(distDir, name, outRelative);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, code);
  console.log(
    `built ${name}/${outRelative} (${source.length} -> ${code.length} bytes)`,
  );
  built++;
}

console.log(`\n${built} unit(s) built into runtime/dist/`);
