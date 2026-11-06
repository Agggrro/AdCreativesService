"use client";

import { NavDropdown } from "@/components/NavDropdown";
import { buttonClass } from "@/components/ui/Button";

/**
 * The signed-in viewer's account, as one disclosure at the right of the bar
 * (docs/design-system.md §6, "Account menu"; ADR-0037). The rows are
 * `AccountPanel`'s, rendered on the server and passed in as children — the access
 * state is read on the viewer's session, which a client component cannot do.
 *
 * A quiet button with a word and a chevron, never the accent: the bar already has
 * its one marker, and an account is not a task.
 */
export function AccountMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <NavDropdown
      label={label}
      align="right"
      triggerClassName={buttonClass("ghost", "md")}
      panelClassName="w-72"
    >
      {children}
    </NavDropdown>
  );
}
