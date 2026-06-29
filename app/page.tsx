import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name, description, type, supported_standards, preview_url")
    .eq("is_published", true)
    .order("name");

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <span className="text-lg font-semibold">AdInteract</span>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-md bg-black px-3 py-1.5 font-medium text-white"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="font-medium">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-black px-3 py-1.5 font-medium text-white"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="px-6 py-16 text-center">
        <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight">
          Interactive video ad creatives, without code
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-500">
          Configure a template, get a dynamic VAST tag for your DSP, and serve
          shoppable, interactive ads. SIMID &amp; VPAID supported.
        </p>
        <div className="mt-8">
          <Link
            href={user ? "/dashboard" : "/signup"}
            className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            {user ? "Go to dashboard" : "Start free trial"}
          </Link>
        </div>
      </section>

      <section className="px-6 pb-20">
        <h2 className="mb-6 text-center text-sm font-medium uppercase tracking-wide text-gray-400">
          Template showcase
        </h2>
        {templates && templates.length > 0 ? (
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-gray-200 p-5">
                <h3 className="font-medium">{t.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{t.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.supported_standards.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400">
            No templates published yet.
          </p>
        )}
      </section>
    </main>
  );
}
