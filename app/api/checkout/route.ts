import { createServerSupabase } from "@/lib/supabase/server";
import { getStripe, PLANS, isPlanKey, TRIAL_PERIOD_DAYS } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a Stripe Checkout session (subscription mode, 7-day trial) for the
 * current user. Entitlement is NOT granted here — only the webhook, after
 * Stripe confirms, writes the subscription. See docs/billing.md.
 *
 * Body: { planKey: 'single_weekly'|'single_monthly'|'ultimate_monthly',
 *         templateId?: string }
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    planKey?: unknown;
    templateId?: unknown;
  } | null;

  if (!body || !isPlanKey(body.planKey)) {
    return Response.json({ error: "invalid plan" }, { status: 400 });
  }
  const plan = PLANS[body.planKey];
  const templateId =
    typeof body.templateId === "string" ? body.templateId : undefined;

  if (plan.requiresTemplate && !templateId) {
    return Response.json({ error: "template required" }, { status: 400 });
  }

  const priceId = process.env[plan.priceEnv];
  if (!priceId) {
    return Response.json({ error: "price not configured" }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  // Carried onto the subscription so the webhook can attribute entitlement.
  const metadata: Record<string, string> = {
    user_id: user.id,
    plan_type: plan.planType,
    ...(templateId ? { template_id: templateId } : {}),
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_PERIOD_DAYS, metadata },
    metadata,
    customer: profile?.stripe_customer_id ?? undefined,
    customer_email: profile?.stripe_customer_id ? undefined : user.email,
    allow_promotion_codes: true,
    success_url: `${siteUrl}/dashboard?checkout=success`,
    cancel_url: `${siteUrl}/dashboard?checkout=cancelled`,
  });

  return Response.json({ url: session.url });
}
