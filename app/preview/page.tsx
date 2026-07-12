import Link from "next/link";
import { VpaidPreview } from "@/components/VpaidPreview";

// Public, in-browser preview of the interactive templates with sample (neutral)
// images so the mechanics can be tried by hand without a full VAST player.
const PREVIEWS: {
  key: string;
  label: string;
  config: Record<string, unknown>;
}[] = [
  {
    key: "scratch-reveal",
    label: "Scratch & Reveal",
    config: {
      imageUrl: "https://picsum.photos/seed/reveal/640/360",
      coverText: "Scratch to reveal",
      revealThreshold: 35,
      ctaText: "Watch full video",
      clickThroughUrl: "https://example.com/offer",
    },
  },
  {
    key: "slider",
    label: "Before / After Slider",
    config: {
      imageBeforeUrl: "https://picsum.photos/seed/before/640/360",
      imageAfterUrl: "https://picsum.photos/seed/after/640/360",
      startPercent: 55,
      ctaText: "See more",
      clickThroughUrl: "https://example.com/offer",
    },
  },
  {
    key: "quiz",
    label: "Quick Setup Quiz",
    config: {
      questionText: "Which do you prefer?",
      option1Label: "Option A",
      option1ImageUrl: "https://picsum.photos/seed/a/200/200",
      option2Label: "Option B",
      option2ImageUrl: "https://picsum.photos/seed/b/200/200",
      resultText: "Great choice!",
      ctaText: "Continue",
      clickThroughUrl: "https://example.com/offer",
    },
  },
  {
    key: "age-gate",
    label: "Age / Content Gate",
    config: {
      backgroundImageUrl: "https://picsum.photos/seed/gate/640/360",
      headline: "This content is 18+",
      subtext: "Confirm your age to continue.",
      confirmText: "I am 18 or older",
      denyText: "Leave",
      clickThroughUrl: "https://example.com/offer",
    },
  },
];

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const current =
    PREVIEWS.find((p) => p.key === sp.t) ?? PREVIEWS[0];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Template preview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Try the interactive mechanics by hand. Sample images are neutral
          placeholders; advertisers supply their own.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {PREVIEWS.map((p) => (
          <Link
            key={p.key}
            href={`/preview?t=${p.key}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              p.key === current.key
                ? "border-black bg-black text-white"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <VpaidPreview
        key={current.key}
        templateKey={current.key}
        config={current.config}
      />

      <p className="mt-8 text-center text-xs text-gray-400">
        <Link href="/" className="underline">
          ← Back to site
        </Link>
      </p>
    </main>
  );
}
