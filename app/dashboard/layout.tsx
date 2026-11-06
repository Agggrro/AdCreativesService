import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Every page under /dashboard needs a signed-in viewer, and this is where that is
 * enforced. The chrome is not here: the list-like pages ask for the product bar
 * through `DashboardShell`, and a creative's own screens bring a bar of their own
 * (`WorkspaceBar`) — see ADR-0038.
 */
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

  return <div className="flex flex-1 flex-col">{children}</div>;
}
