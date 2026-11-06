import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { getDict } from "@/lib/i18n/server";
import { Field, Notice, Panel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/AppTopBar";
import { Container } from "@/components/ui/Container";
import { parseAuthErrorCode } from "@/lib/auth-errors";
import { safeNext, withNext } from "@/lib/safe-next";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const { dict } = await getDict();
  // Carried through sign-up and the confirmation email (ADR-0036).
  const next = safeNext(sp.next);
  // A code of ours, read back — never the query text itself (lib/auth-errors.ts).
  const error = parseAuthErrorCode(sp.error, "signup");

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <div className="flex flex-1 items-center justify-center py-16">
        <Container width="narrow" className="flex flex-col gap-6">
          <h1 className="type-h2">{dict.auth.signUpTitle}</h1>

          {/* `live`: the failed sign-up redirects back here, and nothing on
              this page takes focus to announce it otherwise. */}
          {error && (
            <Notice tone="dead" live>
              {dict.auth.errors[error]}
            </Notice>
          )}

          <Panel className="p-6">
            <form action={signUp} className="flex flex-col gap-5">
              {next && <input type="hidden" name="next" value={next} />}
              <Field label={dict.common.email} name="email" type="email" />
              <Field
                label={dict.common.password}
                name="password"
                type="password"
                minLength={8}
              />
              <Button type="submit" variant="primary" className="w-full">
                {dict.auth.createAccount}
              </Button>
            </form>
          </Panel>

          <p className="type-small text-fg-muted">
            {dict.auth.haveAccount}{" "}
            <Link
              href={withNext("/login", next)}
              className="rounded-ctl font-medium text-accent underline underline-offset-4 transition-colors duration-150 hover:text-accent-hover"
            >
              {dict.common.signIn}
            </Link>
          </p>
        </Container>
      </div>
    </main>
  );
}
