import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { isLocalHeaders } from "@/lib/dev-only";
import { demoConfig, demoUnitKey } from "@/lib/template-demo";
import { HarnessRunner, type HarnessTemplate } from "@/components/dev/HarnessRunner";
import { Container } from "@/components/ui/Container";

export const dynamic = "force-dynamic";

/**
 * The creative harness — a local-only workbench for building and debugging
 * templates.
 *
 * It exists because every other way to look at a creative goes through the
 * configurator: sign in, pick a template, fill a form, mint a preview. That is
 * the right path for a customer and the wrong one for someone changing a render
 * module for the twentieth time in an hour. This runs the unit straight off the
 * local `runtime/dist/` build (`/api/dev/unit/[template]` — not the published
 * object `/api/preview-unit/[template]` serves) with config derived from the
 * template's own schema, reports everything the unit says about itself
 * (ADR-0019), and judges the result against the mandatory lifecycle.
 *
 * Not reachable off this machine: `isLocalHeaders()` and a 404, the same gate as
 * `/api/dev/session` — a development build is not the same thing as an
 * unreachable one, and `next dev` binds 0.0.0.0.
 *
 * Config comes from `demoConfig` rather than fixtures on purpose — the same
 * reasoning as the catalog's demos (`lib/template-demo.ts`): hand-written
 * fixtures drift from the schema, and a template added tomorrow should appear
 * here with no change to this file.
 *
 * Draft templates (`is_published = false`) are listed too, and that is the
 * reason this page reads with the service role rather than the visitor's
 * session: RLS shows anon and authenticated callers published rows only
 * (`templates_select_published`). A new template has to be run here *before*
 * it is published — it is seeded as a draft until its unit is on the CDN and an
 * app that knows its key is deployed (runtime/README.md) — or the mandatory
 * harness check could only ever happen after it was already live. Safe because
 * nothing off this machine can reach the page — `npm run dev` binds 127.0.0.1,
 * which is the actual control, and the header gate above is the second lock
 * that 404s before this read (lib/dev-only.ts, docs/security.md) — and because
 * the read is catalog rows, which carry no user data, narrowed to the columns
 * this page uses.
 */
export default async function HarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; size?: string }>;
}) {
  if (!isLocalHeaders(await headers())) notFound();

  const { t, size } = await searchParams;
  const supabase = createServiceClient();

  const { data: rows, error } = await supabase
    .from("templates")
    .select("id, name, runtime_keys, config_schema, is_published")
    .order("name");

  // Surfaced rather than swallowed: an empty `rows` from a failed read renders
  // the same "nothing is seeded" empty state as a genuinely empty table, and
  // sends the reader off to re-run `db:seed` for a problem that is a grant or a
  // connection.
  if (error) {
    throw new Error(`harness could not read templates: ${error.message}`);
  }

  // Only templates with a resolvable unit — the same derivation the landing
  // page and the catalog use, so the harness cannot disagree with them.
  const templates: HarnessTemplate[] = (rows ?? []).flatMap((row) => {
    const unitKey = demoUnitKey(row.runtime_keys);
    if (!unitKey) return [];
    return [
      {
        id: row.id,
        name: row.name,
        unitKey,
        draft: !row.is_published,
        // Neutral self-hosted placeholders, not the landing page's photographic
        // ones: this surface should not fail because a third-party image host
        // is unreachable, and it must not need the network to render.
        config: demoConfig(row.config_schema, unitKey, "placeholder"),
      },
    ];
  });

  const initialTemplateId = t
    ? templates.find((template) => template.unitKey === t)?.id
    : undefined;

  return (
    <Container width="wide" className="flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-2 border-b border-hairline pb-6">
        <h1 className="type-h2">
          Creative harness
        </h1>
        <p className="type-body max-w-[66ch] text-fg-secondary">
          Runs a built VPAID unit against config derived from its template
          schema, and checks it completed the mandatory lifecycle. Local only —
          this page does not exist in production. Rebuild units with{" "}
          <code className="type-data">npm run build:runtime</code>{" "}
          before a run.
        </p>
      </div>

      <HarnessRunner
        templates={templates}
        initialTemplateId={initialTemplateId}
        initialSize={
          size === "480x270" || size === "320x180" || size === "300x250"
            ? size
            : undefined
        }
      />
    </Container>
  );
}
