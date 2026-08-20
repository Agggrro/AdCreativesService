/**
 * A static, abstract preview of what a template's mechanic looks like.
 *
 * **Static on purpose, and this is a correctness rule rather than a performance
 * one** (docs/design-system.md §6): VPAID units share the `window.getVPAIDAd`
 * global, so a grid of live tiles renders the wrong mechanic, not merely a slow
 * one. The live demo is one per page, in the well.
 *
 * **Drawn entirely in neutrals, and that is a rule rather than a taste.** §6 puts
 * the accent budget on the catalog index at **zero** — a tile is a link, not an
 * action — and §3 forbids the accent on decoration anywhere. Five tiles drawn in
 * apricot would have been fifteen accent appearances against a budget of none, and
 * the same component runs in the landing gallery. The mechanic has to read from
 * *shape*: a divider, a pair of options, a cover, a card. That is what a diagram
 * is for.
 *
 * These are diagrams, not screenshots — every colour is a token, so they follow
 * the theme instead of freezing one. The creative-template exemption in §8 does
 * **not** reach this file: it lives in `components/`, and it draws our UI, not an
 * advertiser's ad.
 *
 * Decorative, so `aria-hidden`: the tile's name and description are the content.
 */
export function TemplatePreview({ type }: { type: string }) {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-video w-full overflow-hidden rounded-panel border border-hairline bg-ground"
    >
      <Mechanic type={type} />
    </div>
  );
}

function Mechanic({ type }: { type: string }) {
  switch (type) {
    case "shoppable_video":
      return (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-ctl border border-line bg-surface p-2">
          <div className="size-7 rounded-ctl bg-surface-2" />
          <div className="h-6 w-14 rounded-ctl bg-fg-disabled" />
        </div>
      );

    case "scratch_reveal":
      return (
        <>
          <div className="absolute inset-5 rounded-ctl border border-line bg-surface-2" />
          <div className="absolute top-[38%] left-[24%] h-[26%] w-[38%] -rotate-3 rounded-ctl bg-fg-disabled" />
        </>
      );

    case "slider":
      return (
        <>
          <div className="absolute inset-y-0 left-0 w-1/2 bg-surface-2" />
          <div className="absolute inset-y-0 left-1/2 w-0.5 bg-fg-muted" />
          <div className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-muted" />
        </>
      );

    case "quiz":
      return (
        <div className="absolute inset-0 flex items-center justify-center gap-3">
          <div className="h-[46%] w-[28%] rounded-ctl border border-line bg-surface-2" />
          <div className="h-[46%] w-[28%] rounded-ctl border border-line bg-surface" />
        </div>
      );

    case "age_gate":
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-0 bg-surface-2/70 blur-sm" />
          <div className="relative flex flex-col items-center gap-2 rounded-ctl border border-line bg-surface px-5 py-3">
            <span className="type-data font-medium text-well-fg">18+</span>
            <div className="h-5 w-16 rounded-ctl bg-fg-disabled" />
          </div>
        </div>
      );

    default:
      // An unknown type gets a neutral frame rather than a guessed mechanic —
      // an honest blank beats a diagram that describes the wrong template.
      return (
        <div className="absolute inset-6 rounded-ctl border border-line" />
      );
  }
}
