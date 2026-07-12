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
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const vpaidBase = readFileSync(join(root, "lib", "vpaid-base.js"), "utf8");
const templatesDir = join(root, "templates");

let built = 0;
for (const name of readdirSync(templatesDir)) {
  const dir = join(templatesDir, name);
  if (!statSync(dir).isDirectory()) continue;

  const renderPath = join(dir, "vpaid.js");
  if (!existsSync(renderPath)) continue;

  const render = readFileSync(renderPath, "utf8");
  // render defines `var TEMPLATE`; base references it in getVPAIDAd.
  const out = `${render}\n${vpaidBase}`;
  const outDir = join(root, "dist", name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "vpaid.js"), out);
  console.log(`built ${name}/vpaid.js`);
  built++;
}

console.log(`\n${built} unit(s) built into runtime/dist/`);
