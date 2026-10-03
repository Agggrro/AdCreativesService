import { handleVpaidUnit } from "@/lib/serving/http/interactive";

// The VPAID unit behind a token — the fallback for a runtime key not yet in
// runtime/manifest.ts. The logic is lib/serving/http/interactive.ts (ADR-0029).
//
// It exists so that *building* a VAST document needs no call to Supabase:
// minting this token is local HMAC, whereas the Storage signed URL it replaced
// was a network round trip sitting on the ad-serving path (ADR-0015).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  return handleVpaidUnit(token);
}
