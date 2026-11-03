import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

/**
 * Validate every golden VAST document against IAB's own XSDs (ADR-0035): the
 * generator's, one per version, and the interactive builder's SIMID and VPAID.
 *
 * The inspector deliberately validates against prose rather than a schema
 * (ADR-0014), and it does not check the order inside Linear, Creative,
 * MediaFiles, VideoClicks, Companion or Icon at all. Both builders write every
 * one of those in the XSD's order, and this is what proves it: each
 * `lib/vast/__golden__/*.xml` must validate against the schema of the version it
 * declares — the bytes the ad path serves, not a re-rendering.
 *
 * The XSDs are fetched from IAB's repository into node_modules/.cache and never
 * committed: that repository's LICENSE grants no right to redistribute them.
 * They are fetched at one pinned commit, so an upstream edit cannot change the
 * verdict under us; moving the pin is a change to read like any other. VAST 4.3
 * has no usable XSD — at the pinned commit `schemas/vast_4.3.xsd` is an empty
 * file — and is checked against 4.2's, which its prose supports for everything
 * we emit.
 *
 * A 4.x schema declares `targetNamespace="http://www.iab.com/VAST"`. Our tags
 * carry no namespace — players match element names, and a default namespace
 * breaks naive XPath in some parsers — so the check adds the one the schema
 * declares before validating. Nothing else about the document is touched.
 *
 *   npm run check:vast-xsd
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN = join(root, "lib", "vast", "__golden__");
/** github.com/InteractiveAdvertisingBureau/vast at 2026-09-28. */
const IAB_COMMIT = "99d5d5132084be83ce4ea893143d240cdaca33c5";
const CACHE = join(root, "node_modules", ".cache", "vast-xsd", IAB_COMMIT);
const SOURCE = `https://raw.githubusercontent.com/InteractiveAdvertisingBureau/vast/${IAB_COMMIT}/`;

const XSD_FOR = {
  "2.0": "vast_2.0.1.xsd",
  "3.0": "vast3_draft.xsd",
  "4.0": "vast4.xsd",
  "4.1": "vast_4.1.xsd",
  "4.2": "vast_4.2.xsd",
  "4.3": "vast_4.2.xsd",
};

async function schema(file) {
  const path = join(CACHE, file);
  if (existsSync(path)) return readFileSync(path, "utf8");
  const response = await fetch(`${SOURCE}${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status} from IAB's repository`);
  const contents = await response.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(path, contents);
  return contents;
}

const failures = [];
// Every golden VAST document: the generator's, one per version, and the
// interactive builder's SIMID and VPAID tags, which serve every other creative.
const files = readdirSync(GOLDEN).filter((name) => name.endsWith(".xml")).sort();
if (files.length === 0) {
  console.error(`No goldens in ${GOLDEN}. Run npm run test:vast first.`);
  process.exit(1);
}

for (const file of files) {
  const xml = readFileSync(join(GOLDEN, file), "utf8");
  const version = /<VAST version="([^"]+)"/.exec(xml)?.[1];
  const xsdFile = version ? XSD_FOR[version] : undefined;
  if (!xsdFile) {
    failures.push(`${file}: no schema for version ${version ?? "(none)"}`);
    continue;
  }
  const xsd = await schema(xsdFile);
  const namespace = /targetNamespace="([^"]+)"/.exec(xsd)?.[1];
  // VAST macros are bracketed by the spec (§6) — `[ERRORCODE]`, `[CACHEBUSTING]`
  // — and IAB's own samples carry them, but libxml2 reads xs:anyURI strictly
  // and refuses an unencoded bracket. They are percent-encoded in the copy
  // under validation only, so what is judged is the document's structure; the
  // served bytes keep their macros, which is what a player substitutes.
  const withoutMacros = xml.replace(/\[([A-Z_]+)\]/g, "%5B$1%5D");
  const document = namespace
    ? withoutMacros.replace("<VAST version=", `<VAST xmlns="${namespace}" version=`)
    : withoutMacros;

  const result = await validateXML({
    xml: [{ fileName: file, contents: document }],
    schema: [{ fileName: xsdFile, contents: xsd }],
  });
  if (result.valid) {
    console.log(`  ${file.padEnd(22)} ${version}  valid against ${xsdFile}`);
  } else {
    for (const error of result.errors) {
      failures.push(`${file} (${xsdFile}) line ${error.loc?.lineNumber ?? "?"}: ${error.message}`);
    }
    console.log(`  ${file.padEnd(22)} ${version}  INVALID against ${xsdFile}`);
  }
}

console.log("");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exit(1);
}
console.log(`All ${files.length} golden documents validate against IAB's XSDs.`);
