import type { Metadata } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { getDict } from "@/lib/i18n/server";
import { getCdnHost } from "@/lib/site";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import "./globals.css";

// Instrument runs on two faces only: Plex Sans for what a human wrote, Plex
// Mono for what the machine owns (docs/design-system.md §4). Both subsets are
// loaded because the UI ships in Russian and English.
// 700 exists for the wordmark alone (docs/design-system.md §4) — no other role
// on the type scale goes above 600.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CreoSmith — Interactive Video Ad Creatives",
  description:
    "Generate and manage interactive video ad creatives (SIMID/VPAID) and get a dynamic VAST tag — no code.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, dict } = await getDict();

  // Vercel Web Analytics — on the app domain only. The ad domain renders
  // through this same layout (`/cdn`, plus the `/cdn/blocked` catch-all every
  // other path there rewrites to), and must not pick the script up:
  //
  //  - that catch-all rewrite in next.config.ts swallows `/_vercel/insights/*`
  //    too, so the beacon would answer with HTML instead of recording;
  //  - every crawler and port-scanner that finds the hostname inside a VAST tag
  //    would otherwise spend page views out of the plan's monthly budget, on a
  //    host that has no product surface to measure.
  //
  // Reading the header costs nothing extra: getDict() already read the locale
  // cookie, so this render was dynamic before we got here. It is the same
  // host comparison middleware.ts makes, for the same domain split (ADR-0018).
  //
  // The script itself is cookie-less and never loads on the ad-serving paths
  // (`/v`, `/t`, `/c/*` are API routes with no HTML), so nothing about this
  // reaches a publisher's page.
  const cdnHost = getCdnHost();
  const onAdDomain =
    cdnHost !== null && (await headers()).get("host") === cdnHost;

  return (
    <html
      lang={locale}
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ground text-fg">
        <LocaleProvider value={{ locale, dict }}>{children}</LocaleProvider>
        {!onAdDomain && <Analytics />}
      </body>
    </html>
  );
}
