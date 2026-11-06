import type { Dict } from "@/lib/i18n/dictionaries";
import type { TopBarLink } from "@/components/TopBar";
import { freeTools } from "@/lib/tools";

/**
 * The sections of a signed-in user's bar: Creatives and the free tools
 * (ADR-0037, which superseded ADR-0008's three sections in part). Everything else
 * a signed-in user needs — the access state, the postback, the language, signing
 * out, and for an admin the accounts list — is one menu at the right of the bar
 * (`AccountMenu`), not a link of its own: the catalog is where *New creative* on
 * Creatives takes you, and a status is a fact, not a page.
 *
 * No `exact` on the creatives entry, which is what keeps the section underlined
 * while the user is deep in the configurator or on the postback page. Tools
 * carries `tools`, which is what turns it into a dropdown instead of a plain link
 * (docs/design-system.md §6 "Nav dropdown") — there's no `/tools` index page to
 * link to, only the two tool pages the dropdown lists directly.
 */
export function mainNav(dict: Dict): TopBarLink[] {
  return [
    { href: "/dashboard/creatives", label: dict.nav.creatives },
    { href: "/tools", label: dict.nav.tools, tools: freeTools(dict) },
  ];
}

/**
 * What a signed-out visitor sees.
 *
 * The nav used to be hidden entirely for them, because the signed-in sections
 * would have bounced them to the login screen. That reasoning does not extend to
 * the sections that are genuinely public: the catalog and the free tools are both
 * reachable without an account, and hiding the tools from exactly the audience
 * they were built for (ADR-0013) would defeat the point.
 */
export function publicNav(dict: Dict): TopBarLink[] {
  return [
    { href: "/catalog", label: dict.nav.catalog },
    { href: "/tools", label: dict.nav.tools, tools: freeTools(dict) },
  ];
}
