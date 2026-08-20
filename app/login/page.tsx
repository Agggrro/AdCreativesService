import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { getDict } from "@/lib/i18n/server";
import { Field, Notice, Panel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/AppTopBar";
import { Container } from "@/components/ui/Container";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const { dict } = await getDict();

  return (
    <main className="flex flex-1 flex-col">
      <AppTopBar />

      <div className="flex flex-1 items-center justify-center py-16">
        <Container width="narrow" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="type-h2">{dict.auth.signInTitle}</h1>
            <p className="type-small text-fg-secondary">
              {dict.auth.signInSubtitle}
            </p>
          </div>

          {sp.message === "check-email" && (
            <Notice tone="info">{dict.auth.checkEmail}</Notice>
          )}
          {sp.error && <Notice tone="dead">{sp.error}</Notice>}

          <Panel className="p-6">
            <form action={signIn} className="flex flex-col gap-5">
              <Field label={dict.common.email} name="email" type="email" />
              <Field
                label={dict.common.password}
                name="password"
                type="password"
              />
              <Button type="submit" variant="primary" className="w-full">
                {dict.common.signIn}
              </Button>
            </form>
          </Panel>

          <p className="type-small text-fg-muted">
            {dict.auth.noAccount}{" "}
            <Link
              href="/signup"
              className="rounded-ctl font-medium text-accent underline underline-offset-4 transition-colors duration-150 hover:text-accent-hover"
            >
              {dict.auth.createOne}
            </Link>
          </p>
        </Container>
      </div>
    </main>
  );
}
