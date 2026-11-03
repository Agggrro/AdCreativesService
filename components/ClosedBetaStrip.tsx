import type { Dict } from "@/lib/i18n/dictionaries";
import { TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/beta-access";
import { Container } from "@/components/ui/Container";

/**
 * The closed-beta notice under the top bar (docs/design-system.md §6 "Site
 * strip", ADR-0034): access is granted by hand, and here is where to ask.
 *
 * `info` tint and text, never the accent — the strip informs, it does not act.
 * The sentence and the link are separate flex items so a 390px wrap happens
 * between them, never inside the link. The handle is mono: it is a value to
 * copy (§4), and it is what the visitor types into Telegram.
 */
export function ClosedBetaStrip({ dict }: { dict: Dict }) {
  return (
    <div className="border-t border-hairline bg-info-bg">
      <Container
        width="wide"
        className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-0 py-2 type-small text-info"
      >
        <span>{dict.beta.strip}</span>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-ctl underline underline-offset-4 transition-colors duration-150 hover:text-fg"
        >
          {dict.beta.stripLink}{" "}
          <span className="data-instr">@{TELEGRAM_HANDLE}</span>
        </a>
      </Container>
    </div>
  );
}
