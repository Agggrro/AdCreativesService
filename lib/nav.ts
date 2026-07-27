import type { Dict } from "@/lib/i18n/dictionaries";
import type { TopBarLink } from "@/components/TopBar";

/**
 * The three product sections (ADR-0008). Order is deliberate: the catalog is
 * where a new user starts, "my creatives" is where a returning one lives, and
 * billing sits last because it is the least frequent task.
 *
 * `exact: false` on the creatives entry is what keeps the section underlined
 * while the user is deep in the configurator.
 */
export function mainNav(dict: Dict): TopBarLink[] {
  return [
    { href: "/catalog", label: dict.nav.catalog },
    { href: "/dashboard/creatives", label: dict.nav.myCreatives },
    { href: "/dashboard/subscriptions", label: dict.nav.subscriptions },
  ];
}
