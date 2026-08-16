import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";
import { dictionaries, LOCALES } from "@/lib/i18n/dictionaries";

/**
 * The only page the ad domain serves (ADR-0018). Its reader is an ad ops person
 * who found this hostname inside a VAST tag and has to decide whether to
 * whitelist it, so it answers "whose is this and what does it do" and stops.
 *
 * **Both locales at once, deliberately.** Every other surface picks one from the
 * language cookie — but there is no cookie on this domain, by design, and the
 * audience is international ad ops rather than our signed-in users. Rendering
 * both satisfies the bilingual rule without putting locale logic on a public ad
 * host, which docs/architecture.md forbids.
 */
export const metadata: Metadata = {
  title: "AdInteract — ad delivery domain",
  // Nothing here is a landing page; indexing it would only put a bare
  // infrastructure host into search results.
  robots: { index: false, follow: false },
};

export default function CdnInfoPage() {
  const siteUrl = getSiteUrl();

  return (
    <main className="mx-auto flex min-h-full max-w-[68ch] flex-col gap-8 px-6 py-16">
      {LOCALES.map((locale) => {
        const t = dictionaries[locale].cdn;
        return (
          <section key={locale} className="flex flex-col gap-3" lang={locale}>
            <h1 className="label-instr">{t.heading}</h1>
            <p className="text-[13px] leading-5 text-fg">{t.whose}</p>
            <p className="text-[13px] leading-5 text-fg-muted">{t.noSite}</p>
            <p className="text-[13px] leading-5 text-fg-muted">{t.whitelist}</p>
            <a
              href={siteUrl}
              className="self-start text-[13px] underline underline-offset-4 hover:text-fg"
            >
              {t.goToSite}
            </a>
          </section>
        );
      })}
    </main>
  );
}
