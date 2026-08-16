import type { Dict } from "@/lib/i18n/dictionaries";
import type { TopBarLink } from "@/components/TopBar";
import { freeTools } from "@/lib/tools";

/**
 * The product sections for a signed-in user (ADR-0008, extended by ADR-0013).
 * Order is deliberate: the catalog is where a new user starts, "my creatives"
 * is where a returning one lives, billing sits last because it is the least
 * frequent task, and the free tools sit after the product itself because they
 * are a side entrance rather than part of the core loop.
 *
 * `exact: false` on the creatives entry is what keeps the section underlined
 * while the user is deep in the configurator. Tools carries `tools`, which is
 * what turns it into a dropdown instead of a plain link (docs/design-system.md
 * §6 "Nav dropdown") — there's no `/tools` index page to link to any more,
 * only the two tool pages the dropdown lists directly.
 */
export function mainNav(dict: Dict): TopBarLink[] {
  return [
    { href: "/catalog", label: dict.nav.catalog },
    { href: "/dashboard/creatives", label: dict.nav.myCreatives },
    { href: "/dashboard/subscriptions", label: dict.nav.subscriptions },
    { href: "/tools", label: dict.nav.tools, tools: freeTools(dict) },
  ];
}

/**
 * What a signed-out visitor sees.
 *
 * The nav used to be hidden entirely for them, because two of the three
 * sections would have bounced them to the login screen. That reasoning does not
 * extend to the sections that are genuinely public: the catalog and the free
 * tools are both reachable without an account, and hiding the tools from
 * exactly the audience they were built for (ADR-0013) would defeat the point.
 */
export function publicNav(dict: Dict): TopBarLink[] {
  return [
    { href: "/catalog", label: dict.nav.catalog },
    { href: "/tools", label: dict.nav.tools, tools: freeTools(dict) },
  ];
}
