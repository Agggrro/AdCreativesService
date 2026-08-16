import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { getDict } from "@/lib/i18n/server";
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

  return (
    <html
      lang={locale}
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ground text-fg">
        <LocaleProvider value={{ locale, dict }}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
