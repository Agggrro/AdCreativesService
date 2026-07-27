import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppTopBar } from "@/components/AppTopBar";

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
      <AppTopBar />
      <div className="mx-auto w-full max-w-[1080px] px-6 py-8">{children}</div>
    </div>
  );
}
