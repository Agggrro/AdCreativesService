import type { Dict } from "@/lib/i18n/dictionaries";
import { TELEGRAM_URL } from "@/lib/beta-access";
import { Notice } from "@/components/ui/Field";

/**
 * The closed-beta notice, at the top of Creatives for an account without access
 * (docs/design-system.md §6, "Access notice"; ADR-0034, ADR-0037). It replaced a
 * strip that hung under the bar on every page.
 *
 * A `Notice` of tone `info` — it informs, it does not act, so never the accent —
 * with the link in the notice's `action` slot, which keeps a 390px wrap between
 * the sentence and the link and never inside the link.
 */
export function AccessNotice({ dict }: { dict: Dict }) {
  return (
    <Notice
      tone="info"
      action={
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-ctl underline underline-offset-4 transition-colors duration-150 hover:text-fg"
        >
          {dict.access.contact}
        </a>
      }
    >
      {dict.access.notice}
    </Notice>
  );
}
