"use client";

import { HelpLabel } from "@/components/ui/Tooltip";

/**
 * A `config_schema` group rendered as a section (ADR-0011), and the VAST
 * generator's sections (ADR-0035) — one implementation of both.
 *
 * Sections are separated by a hairline, never by empty space alone
 * (docs/design-system.md §5) — including the first one, which always has the
 * creative-name field and the delivery-format control above it.
 *
 * The heading is the `h3` role (§6). Deliberately *not*
 * `label-instr`: that role belongs to the field labels inside the section, and
 * reusing it here would flatten the two levels into one. `help` puts the
 * heading behind a help tooltip, for an explanation, never for a limit the
 * user must act on (§6, "Help tooltip").
 */
export function FieldSection({
  heading,
  help,
  children,
}: {
  heading: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-5 border-t border-hairline pt-6">
      {/*
        `float-left w-full` takes the legend out of the fieldset's border-notch
        algorithm, so the rule above runs unbroken instead of being cut around
        the heading.
      */}
      <legend className="float-left w-full type-h3">
        {help ? <HelpLabel label={heading} help={help} className="type-h3" /> : heading}
      </legend>
      {children}
    </fieldset>
  );
}
