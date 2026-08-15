import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { LinkButton } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Field";

export const metadata: Metadata = {
  title: "VAST generator — build a VAST tag",
  description:
    "Build a spec-correct VAST tag from parameters: linear spot, wrapper, tracking, interactive layer. In development.",
  // Reachable and linked, but kept out of the index until it does something.
  // A thin "in development" page is a weak quality signal that costs the whole
  // domain, not just this URL. Comes out when the generator ships — and the
  // sitemap omits it for the same reason.
  robots: { index: false, follow: true },
};

/**
 * Placeholder for the second free tool (ADR-0013).
 *
 * It exists as a route rather than a disabled row so the tools index can link
 * somewhere honest, and so the page can say what the generator will be for
 * instead of leaving a dead link that reads as a broken build.
 */
export default async function VastGeneratorPage() {
  const { dict } = await getDict();
  const t = dict.tools;

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">
            {t.generatorName}
          </h1>
          <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">
            {t.generatorDescription}
          </p>
        </div>

        <Panel className="px-4 py-8">
          <div className="flex max-w-[66ch] flex-col items-start gap-3">
            <h2 className="text-[15px] font-semibold leading-[22px]">
              {t.generatorSoonTitle}
            </h2>
            <p className="text-[13px] leading-5 text-fg-muted">{t.generatorSoonBody}</p>
            {/* A control names what happens, not what it points at (§8). */}
            <LinkButton href="/tools/vast-validator" variant="secondary">
              {t.open} · {t.validatorName}
            </LinkButton>
          </div>
        </Panel>
      </div>
    </main>
  );
}
