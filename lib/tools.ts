import type { Dict } from "@/lib/i18n/dictionaries";
import type { Tone } from "@/components/ui/State";

export type ToolListing = {
  href: string;
  name: string;
  description: string;
  tone: Tone;
  state: string;
};

/**
 * The two free tools (ADR-0013), assembled once here for the top-bar dropdown
 * (`ToolsNavMenu`) — the only place they're listed together now that
 * `/tools` (the index page) is gone.
 */
export function freeTools(dict: Dict): ToolListing[] {
  const t = dict.tools;
  return [
    {
      href: "/tools/vast-validator",
      name: t.validatorName,
      description: t.validatorDescription,
      tone: "live",
      state: t.stateAvailable,
    },
    {
      href: "/tools/vast-generator",
      name: t.generatorName,
      description: t.generatorDescription,
      tone: "idle",
      state: t.stateSoon,
    },
  ];
}
