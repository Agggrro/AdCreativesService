/**
 * AdInteract runtime build. Concatenates the shared VPAID base with each
 * template's render module into a self-contained unit under runtime/dist/.
 * Upload the dist files to the `creatives` Storage bucket at the paths in each
 * template's runtime_keys. Run: `npm run build:runtime`.
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

let built = 0;
for (const name of readdirSync(templatesDir)) {
  const dir = join(templatesDir, name);
  if (!statSync(dir).isDirectory()) continue;

  const renderPath = join(dir, "vpaid.js");
  if (!existsSync(renderPath)) continue;

  const render = readFileSync(renderPath, "utf8");
  // render defines `var TEMPLATE`; base references it in getVPAIDAd.
  const out = `${render}\n${vpaidBase}`;
  const outRelative = OUTPUT_RELATIVE_PATH[name] || "vpaid.js";
  const outPath = join(distDir, name, outRelative);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, out);
  console.log(`built ${name}/${outRelative}`);
  built++;
}

console.log(`\n${built} unit(s) built into runtime/dist/`);
