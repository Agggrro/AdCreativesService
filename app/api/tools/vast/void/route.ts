export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The dry-run tracker sink.
 *
 * Every tracking URL in a neutralized document points here. The request is
 * answered and discarded: the point is that the player believes it fired a
 * pixel while nothing reaches the third party who would have counted it.
 *
 * Nothing is recorded. The event timeline is built from the player's own event
 * API, which reports what it fired and when far more precisely than a beacon
 * arriving out of order ever could — and logging would mean storing fragments
 * of other people's ad tags, which this tool does not do.
 *
 * 204 rather than 200: some players treat a zero-length 200 as a failed pixel,
 * and a "no content" answer is what a real tracking endpoint returns anyway.
 */
export async function GET(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      // A tracking pixel is fired from the player's own context, sometimes as
      // an XHR rather than an image. Answering the preflight-free simple case
      // for any origin keeps that from failing in a way the user would read as
      // a fault in their tag.
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function POST(): Promise<Response> {
  return GET();
}
