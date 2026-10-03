import type { Metadata } from "next";
import { headers } from "next/headers";
import { Prata, Onest, IBM_Plex_Mono } from "next/font/google";
import { getDict } from "@/lib/i18n/server";
import { getCdnHost } from "@/lib/site";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { WebAnalytics } from "@/components/WebAnalytics";
import "./globals.css";

// Midnight runs on three faces (docs/design-system.md §4). All three carry
// Cyrillic, so both UI languages share one grid with no font substitution — the
// display face is chosen for that as much as for its shape.
//
// Prata is display only: headline sizes, 32px and up. It ships in a single
// weight and there is no other, which is why nothing on the scale asks for a
// bolder one.
const prata = Prata({
  variable: "--font-prata",
  subsets: ["latin", "cyrillic"],
  weight: ["400"],
  display: "swap",
});

// Body weight is 300 — the page is airier at identical sizes, and it is what
// keeps a dark surface from reading as heavy.
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

// Everything the machine owns: VAST tags, ids, formats, timecodes, metrics,
// status words, labels, and all text inputs.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

/**
 * A tab title and a SERP description are user-visible strings, so they go through
 * the i18n layer like every other one (docs/design-system.md §10). Before this they
 * were English literals, which meant a page rendering `lang="ru"` titled itself in
 * English.
 *
 * `generateMetadata` rather than a static export because the locale lives in a
 * cookie, which only a request can read.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDict();
  return { title: dict.meta.title, description: dict.meta.description };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, dict } = await getDict();

  // Web analytics — Cloudflare's since ADR-0029, Vercel's before — on the app
  // domain only. The ad domain renders through this same layout (`/cdn`, plus
  // the `/cdn/blocked` catch-all every other path there rewrites to), and must
  // not pick the script up:
  //
  //  - the ad domain is a host strangers find inside VAST tags; every crawler
  //    and port-scanner would count as a visitor to a host that has no product
  //    surface to measure;
  //  - a third-party script has no business on the origin the validator runs
  //    strangers' creatives on (`/c/player`, ADR-0021).
  //
  // Reading the header costs nothing extra: getDict() already read the locale
  // cookie, so this render was dynamic before we got here. It is the same
  // host comparison middleware.ts makes, for the same domain split (ADR-0018).
  //
  // The beacon is cookie-less and never reaches a publisher's page: `/v`, `/t`
  // and the `/c/*` asset paths answer without HTML at all.
  const cdnHost = getCdnHost();
  const onAdDomain =
    cdnHost !== null && (await headers()).get("host") === cdnHost;

  return (
    <html
      lang={locale}
      className={`${prata.variable} ${onest.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ground text-fg">
        <LocaleProvider value={{ locale, dict }}>{children}</LocaleProvider>
        {!onAdDomain && <WebAnalytics />}
      </body>
    </html>
  );
}
