import { handleSimidDocument } from "@/lib/serving/http/interactive";

// The SIMID document, behind its token. The logic — and why this route exists
// at all — is lib/serving/http/interactive.ts, shared with the ad Worker
// (ADR-0029), which answers `/c/s/:token` on the ad domain.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  return handleSimidDocument(token);
}
