import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";
import { AppTopBar } from "@/components/AppTopBar";
import { VastValidator } from "@/components/tools/VastValidator";

export const metadata: Metadata = {
  title: "VAST validator — check and play a VAST tag",
  description:
    "Paste a VAST tag URL or XML. Checks it against the IAB specification, walks the wrapper chain, plays it in Google IMA, and reports every fault with a fix. VPAID, SIMID and OMID included. Free, no account.",
};

/**
 * The public VAST validator (ADR-0013).
 *
 * Server component for the shell and the top bar; everything below is client
 * state, because a validation run is a conversation rather than a page load.
 */
export default async function VastValidatorPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[] }>;
}) {
  const { dict } = await getDict();
  const t = dict.tools.validator;

  // `?tag=` makes a URL-mode run shareable and repeatable without storing
  // anything on our side. Reading it here rather than in the client component
  // keeps the controlled input's server and client markup identical.
  const { tag } = await searchParams;
  const initialTag = (Array.isArray(tag) ? tag[0] : tag) ?? "";

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">{t.title}</h1>
          <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">{t.subtitle}</p>
        </div>

        <VastValidator initialTag={initialTag} />
      </div>
    </main>
  );
}
