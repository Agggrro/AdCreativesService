import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";
import { CopyButton } from "@/components/CopyButton";
import { SubscribeButton } from "@/components/SubscribeButton";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const siteUrl = getSiteUrl();

  const [{ data: subs }, { data: creatives }, { data: templates }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select(
          "id, plan_type, template_id, status, current_period_end, cancel_at_period_end",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("creatives")
        .select("id, selected_format, status, template_id")
        .order("created_at", { ascending: false }),
      supabase
        .from("templates")
        .select("id, name, supported_standards")
        .eq("is_published", true)
        .order("name"),
    ]);

  const templateName = new Map((templates ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-10">
      {/* Subscriptions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Your subscriptions</h2>
        {subs && subs.length > 0 ? (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {subs.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {s.plan_type === "all_access"
                      ? "Ultimate (all-access)"
                      : `Single — ${templateName.get(s.template_id ?? "") ?? "template"}`}
                  </span>
                  {s.current_period_end && (
                    <span className="ml-2 text-gray-400">
                      renews {new Date(s.current_period_end).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No active subscriptions. Subscribe below to start serving creatives.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 p-4">
          <div className="flex-1">
            <p className="font-medium">Ultimate — all-access</p>
            <p className="text-sm text-gray-500">
              $30 / month · every template · 7-day free trial
            </p>
          </div>
          <SubscribeButton planKey="ultimate_monthly">
            Subscribe
          </SubscribeButton>
        </div>
      </section>

      {/* Templates */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Templates</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(templates ?? []).map((t) => (
            <div key={t.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-medium">{t.name}</h3>
                <div className="flex gap-1">
                  {t.supported_standards.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-600"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={`/dashboard/creatives/new?template=${t.id}`}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
                >
                  Configure creative
                </Link>
                <SubscribeButton
                  planKey="single_weekly"
                  templateId={t.id}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  $2 / week
                </SubscribeButton>
                <SubscribeButton
                  planKey="single_monthly"
                  templateId={t.id}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  $5 / month
                </SubscribeButton>
              </div>
            </div>
          ))}
          {(!templates || templates.length === 0) && (
            <p className="text-sm text-gray-500">No templates published yet.</p>
          )}
        </div>
      </section>

      {/* Creatives */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Your creatives</h2>
        {creatives && creatives.length > 0 ? (
          <div className="space-y-3">
            {creatives.map((c) => {
              const tag = `${siteUrl}/api/vast?creative_id=${c.id}`;
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">
                        {templateName.get(c.template_id) ?? "Creative"}
                      </span>
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-600">
                        {c.selected_format}
                      </span>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
                      {tag}
                    </code>
                    <CopyButton value={tag} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No creatives yet.{" "}
            <Link
              href="/dashboard/creatives/new"
              className="font-medium underline"
            >
              Create one
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === "active" || status === "trialing";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}
