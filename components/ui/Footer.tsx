import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { Container } from "@/components/ui/Container";

/**
 * The site footer: a copyright and three links (ADR-0037). It had a lockup, a
 * tagline and three link columns; the tagline repeated the first screen, the
 * columns repeated the top bar, and the standards column repeated a band of the
 * landing page. The two tools are named here the way the bar's dropdown names them.
 */
export function Footer({ dict }: { dict: Dict }) {
  return (
    <footer className="border-t border-hairline bg-ground">
      <Container
        width="wide"
        className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-8"
      >
        <span className="type-caption text-fg-muted">
          {dict.footer.rights}
        </span>
        <nav aria-label={dict.footer.nav} className="flex flex-wrap gap-x-6">
          <FooterLink href="/catalog">{dict.nav.catalog}</FooterLink>
          <FooterLink href="/tools/vast-validator">
            {dict.tools.validatorName}
          </FooterLink>
          <FooterLink href="/tools/vast-generator">
            {dict.tools.generatorName}
          </FooterLink>
        </nav>
      </Container>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="type-small w-fit rounded-ctl py-2 text-fg-secondary transition-colors duration-150 hover:text-fg"
    >
      {children}
    </Link>
  );
}
