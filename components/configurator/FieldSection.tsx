"use client";

/**
 * A `config_schema` group rendered as a section (ADR-0011).
 *
 * Sections are separated by a hairline, never by empty space alone
 * (docs/design-system.md §5) — including the first one, which always has the
 * creative-name field and the delivery-format control above it.
 *
 * The heading is the `h2` role — 15/22 weight 600. Deliberately *not*
 * `label-instr`: that role belongs to the field labels inside the section, and
 * reusing it here would flatten the two levels into one.
 */
export function FieldSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-5 border-t border-hairline pt-6">
      {/*
        `float-left w-full` takes the legend out of the fieldset's border-notch
        algorithm, so the rule above runs unbroken instead of being cut around
        the heading.
      */}
      <legend className="float-left w-full text-[15px] font-semibold leading-[22px] text-fg">
        {heading}
      </legend>
      {children}
    </fieldset>
  );
}
