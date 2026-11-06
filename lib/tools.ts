import type { Dict } from "@/lib/i18n/dictionaries";

export type ToolListing = {
  href: string;
  name: string;
};

/**
 * The two free tools (ADR-0013), assembled once here for the top-bar dropdown
 * (`ToolsNavMenu`), the mobile panel and the landing page — now that `/tools`
 * (the index page) is gone, this is the one place they are listed together.
 *
 * A tool is its name and nothing else (ADR-0037): both are available, so a state
 * word said nothing, and the name needs no sentence under it.
 */
export function freeTools(dict: Dict): ToolListing[] {
  const t = dict.tools;
  return [
    { href: "/tools/vast-validator", name: t.validatorName },
    { href: "/tools/vast-generator", name: t.generatorName },
  ];
}
