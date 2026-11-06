import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { signOut } from "@/app/auth/actions";
import { TELEGRAM_URL } from "@/lib/beta-access";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { StateWord } from "@/components/ui/State";

/**
 * The two homes differ only in type and tone: the desktop dropdown reads at the
 * table's 13px in the Tools panel's own colour, the mobile panel at the 15px
 * (`type-body`) and the muted colour its section links already use, so the rows
 * under them read as the same list rather than a second one (§6, "Mobile
 * navigation").
 */
const SIZE = { menu: "type-small", panel: "type-body" } as const;
const TONE = { menu: "text-fg", panel: "text-fg-secondary" } as const;

/**
 * Rows run edge to edge, so a focus ring drawn 2px outside them would land on the
 * dropdown's border, and in the mobile panel be clipped by its scroll box and by
 * the viewport: they draw it inside (§2).
 */
const ROW_BASE =
  "focus-inset flex h-11 items-center px-5 transition-colors duration-150 hover:bg-surface-2";

/**
 * The rows of the signed-in viewer's account (docs/design-system.md §6, "Account
 * menu"; ADR-0037): the address with the access state under it, the postback, for
 * an admin the accounts list, the language, and sign-out. One server component
 * serves both homes — the desktop dropdown (`AccountMenu`) and the mobile panel —
 * so the two cannot drift.
 *
 * Access is a state, not a page. A viewer without it gets the way to ask here too;
 * the admin is the one who answers, so the admin is not told to write to themself.
 * The address is mono: it is an identifier (§4).
 */
export function AccountPanel({
  dict,
  email,
  granted,
  admin,
  variant,
}: {
  dict: Dict;
  email: string;
  granted: boolean;
  admin: boolean;
  variant: keyof typeof SIZE;
}) {
  const row = `${ROW_BASE} ${SIZE[variant]} ${TONE[variant]}`;
  // Sign-out is the quiet row: muted at rest in both homes, full colour on hover.
  const quietRow = `${ROW_BASE} ${SIZE[variant]} w-full rounded-b-ctl text-fg-secondary hover:text-fg`;

  return (
    <div className="flex flex-col divide-y divide-hairline">
      <div className="flex flex-col items-start gap-2 px-5 py-3">
        <span className="data-instr type-small break-all text-fg">{email}</span>
        <StateWord
          tone={granted ? "live" : "idle"}
          label={granted ? dict.access.granted : dict.access.notGranted}
        />
        {!granted && !admin && (
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-ctl type-small text-fg-secondary underline underline-offset-4 transition-colors duration-150 hover:text-fg"
          >
            {dict.access.contact}
          </a>
        )}
      </div>

      <Link href="/dashboard/creatives/postback" className={row}>
        {dict.postback.title}
      </Link>
      {admin && (
        <Link href="/dashboard/admin" className={row}>
          {dict.nav.accounts}
        </Link>
      )}

      <div className="flex h-11 items-center justify-between gap-3 px-5">
        <span className="label-instr">{dict.nav.languageShort}</span>
        <LanguageSwitcher />
      </div>

      <form action={signOut}>
        <button type="submit" className={quietRow}>
          {dict.common.signOut}
        </button>
      </form>
    </div>
  );
}
