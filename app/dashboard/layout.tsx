import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-semibold">
            AdInteract
          </Link>
          <Link href="/dashboard" className="text-sm text-gray-600">
            Dashboard
          </Link>
          <Link
            href="/dashboard/creatives/new"
            className="text-sm text-gray-600"
          >
            New creative
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{user.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
