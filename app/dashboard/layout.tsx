import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppTopBar } from "@/components/AppTopBar";
import { Container } from "@/components/ui/Container";

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
      {/*
        `default` (1200px), not the marketing `wide`: a dashboard is read and
        operated, and its tables stop being scannable long before 1440px
        (docs/design-system.md §5).
      */}
      <Container width="default" className="py-10">
        {children}
      </Container>
    </div>
  );
}
