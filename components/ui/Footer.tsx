import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { BrandMark } from "@/components/ui/BrandMark";
import { Container } from "@/components/ui/Container";

/**
 * The site footer. New in Midnight — the previous system had no footer anywhere in
 * the repository, so every page simply stopped.
 *
 * The standards column carries machine values (`SIMID 1.1`, `VPAID 2.0`,
 * `VAST 4.2`), so it is mono and identical in both locales — §10 leaves the
 * industry's own English terms untranslated on purpose, because translating them
 * would make the product harder to match against a DSP.
 */
export function Footer({ dict }: { dict: Dict }) {
  return (
    <footer className="border-t border-hairline bg-ground">
      <Container width="wide" className="py-14 md:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-12">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="type-h3 font-semibold">
                <span className="text-accent">{dict.brand.nameLead}</span>
                {dict.brand.nameTail}
              </span>
            </div>
            <p className="type-small max-w-[34ch] text-fg-muted">
              {dict.footer.tagline}
            </p>
          </div>

          <FooterColumn title={dict.footer.product}>
            <FooterLink href="/catalog">{dict.nav.catalog}</FooterLink>
            <FooterLink href="/#how">{dict.footer.howItWorks}</FooterLink>
            <FooterLink href="/dashboard/subscriptions">
              {dict.nav.subscriptions}
            </FooterLink>
          </FooterColumn>

          <FooterColumn title={dict.footer.tools}>
            <FooterLink href="/tools/vast-validator">
              {dict.tools.validatorName}
            </FooterLink>
            <FooterLink href="/tools/vast-generator">
              {dict.tools.generatorName}
            </FooterLink>
          </FooterColumn>

          <FooterColumn title={dict.footer.standards}>
            <span className="type-data text-fg-secondary">
              SIMID 1.1
            </span>
            <span className="type-data text-fg-secondary">
              VPAID 2.0
            </span>
            <span className="type-data text-fg-secondary">
              VAST 4.2
            </span>
          </FooterColumn>
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-hairline pt-6">
          <span className="data-instr type-caption text-fg-muted">
            {dict.footer.rights}
          </span>
        </div>
      </Container>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="label-instr">{title}</span>
      {children}
    </div>
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
      className="type-body w-fit rounded-ctl text-fg-secondary transition-colors duration-150 hover:text-fg"
    >
      {children}
    </Link>
  );
}
