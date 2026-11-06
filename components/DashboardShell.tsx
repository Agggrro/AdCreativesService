import { AppTopBar } from "@/components/AppTopBar";
import { Container } from "@/components/ui/Container";

/**
 * The product bar and the 1200px container the dashboard's list-like pages sit in
 * — Creatives, the postback, the accounts list.
 *
 * It was the dashboard layout. A creative's own screens (Settings, Stats, a new
 * creative) are a workspace with a bar of their own (docs/design-system.md §6,
 * "Workspace"; ADR-0038), and a layout cannot opt out of its parent's chrome, so
 * the chrome moved here and each page that wants it asks for it. The layout keeps
 * what every dashboard page needs and no page may skip: a signed-in viewer.
 *
 * `default` (1200px), not the marketing `wide`: a dashboard is read and operated,
 * and its tables stop being scannable long before 1440px (§5).
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppTopBar />
      <main>
        <Container width="default" className="py-10">
          {children}
        </Container>
      </main>
    </>
  );
}
