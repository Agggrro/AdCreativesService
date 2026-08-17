import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isLocalRequest } from "@/lib/dev-only";
import { PREVIEW_UNIT_PATHS, isPreviewUnitKey } from "@/lib/preview-units";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve a VPAID unit straight off the local `runtime/dist/` build, for the
 * creative harness.
 *
 * Deliberately not `/api/preview-unit/[template]`, and the difference is the
 * whole point of this route. That one goes through `loadRuntimeBytes`, which
 * resolves the *published* object from the runtime manifest — correct for the
 * public catalog demo, which must never show something other than the shipped
 * unit, and useless for building a template: it would take a
 * `npm run runtime:push` to the production CDN before every local look at an
 * edit. This route reads the file `npm run build:runtime` just wrote, so the
 * harness shows the working copy and nothing else.
 *
 * No path traversal is possible: `template` is looked up in
 * `PREVIEW_UNIT_PATHS`, a closed allow-list, and anything not in it 404s — the
 * same guarantee the public preview route relies on.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ template: string }> },
): Promise<Response> {
  if (!isLocalRequest(request)) return new Response(null, { status: 404 });

  const { template } = await params;
  // Through `isPreviewUnitKey`, not a bare index. A plain object literal
  // answers `constructor`, `toString` and `__proto__` from its prototype
  // chain, so `PREVIEW_UNIT_PATHS[template]` alone is truthy for keys nobody
  // put in the table — the traversal guarantee stated above would then be
  // resting on there happening to be no *strings* on Object.prototype rather
  // than on the check. `hasOwnProperty` is what the closed list actually means.
  if (!isPreviewUnitKey(template)) {
    return new Response("// unknown template\n", { status: 404 });
  }
  const path = PREVIEW_UNIT_PATHS[template];

  try {
    const bytes = await readFile(join(process.cwd(), "runtime", "dist", path));
    return new Response(bytes, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        // Never cached: the file changes on every rebuild, and a stale unit
        // here would send someone debugging a bug they already fixed.
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(
      `// ${path} is not built — run \`npm run build:runtime\`\n`,
      { status: 404, headers: { "content-type": "application/javascript; charset=utf-8" } },
    );
  }
}
