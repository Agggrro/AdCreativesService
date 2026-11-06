"use client";

import Link from "next/link";
import { NavDropdown } from "@/components/NavDropdown";
import { DeleteCreativeButton } from "@/components/DeleteCreativeButton";
import { DuplicateCreativeButton } from "@/components/DuplicateCreativeButton";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";

/** One row of the menu: 44px, `fg`, hover on `surface-2`, the ring drawn inside (§2). */
const ROW =
  "focus-inset flex h-11 w-full items-center px-5 text-left type-small text-fg transition-colors duration-150 hover:bg-surface-2";

/**
 * *More* on a creative's bar (docs/design-system.md §6, "Workspace"): the actions
 * that are not the screen's one action — check the tag in the validator, make a
 * copy, delete. The Duplicate row is a form and the Delete row opens a dialog, so
 * the menu does not close on a click (a form closed under its own click would
 * unmount before it submitted) and keeps its children mounted while closed (the
 * dialog's mousedown counts as outside the panel and would otherwise take the
 * dialog down with it) — `NavDropdown`'s two switches for exactly this.
 *
 * Delete goes through the destructive confirmation like every other irreversible
 * action; the row is plain text, never coloured (§3).
 */
export function MoreMenu({
  creativeId,
  creativeName,
  tag,
  portal = false,
}: {
  creativeId: string;
  creativeName: string;
  tag: string;
  /** In a row of a scrolling table, whose frame would clip the panel (`NavDropdown`). */
  portal?: boolean;
}) {
  const dict = useDict();

  return (
    <NavDropdown
      label={dict.workspace.more}
      align="right"
      keepMounted
      portal={portal}
      triggerClassName={buttonClass("secondary", "sm")}
      panelClassName="w-64 divide-y divide-hairline"
    >
      {/* The validator fetches the live tag with its pixels held back (dry run),
          so checking it counts nothing. */}
      <Link
        href={`/tools/vast-validator?tag=${encodeURIComponent(tag)}`}
        className={`${ROW} first:rounded-t-ctl`}
      >
        {dict.dashboard.checkInValidator}
      </Link>
      <DuplicateCreativeButton creativeId={creativeId} rowClassName={ROW} />
      <div className="[&>button]:rounded-b-ctl">
        <DeleteCreativeButton
          creativeId={creativeId}
          creativeName={creativeName}
          rowClassName={ROW}
        />
      </div>
    </NavDropdown>
  );
}
