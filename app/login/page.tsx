import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { getDict } from "@/lib/i18n/server";
import { Field, Notice, Panel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/AppTopBar";

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

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold leading-7 tracking-[-0.01em]">
              {dict.auth.signInTitle}
            </h1>
            <p className="text-[13px] leading-5 text-fg-muted">
              {dict.auth.signInSubtitle}
            </p>
          </div>

          {sp.message === "check-email" && (
            <Notice tone="info">{dict.auth.checkEmail}</Notice>
          )}
          {sp.error && <Notice tone="dead">{sp.error}</Notice>}

          <Panel className="p-5">
            <form action={signIn} className="flex flex-col gap-4">
              <Field label={dict.common.email} name="email" type="email" />
              <Field
                label={dict.common.password}
                name="password"
                type="password"
              />
              <Button type="submit" variant="primary" className="w-full justify-center">
                {dict.common.signIn}
              </Button>
            </form>
          </Panel>

          <p className="text-[13px] text-fg-muted">
            {dict.auth.noAccount}{" "}
            <Link
              href="/signup"
              className="font-medium text-fg underline underline-offset-4"
            >
              {dict.auth.createOne}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
