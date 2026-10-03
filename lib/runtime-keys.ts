/**
 * The creative runtime's object keys (ADR-0029): `runtime/<logical path>.<sha256[0..8]>.<ext>`,
 * the content-addressed objects `npm run runtime:push` writes to R2. They share
 * the bucket with advertiser media and cannot be confused with it: a media key is
 * `{uuid}/{uuid}.{ext}` and nothing else (lib/creative-media.ts).
 *
 * A module of its own, with no imports, so the ad Worker can check a key without
 * bundling the R2 client.
 */
export const RUNTIME_KEY_RE = /^runtime\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.[0-9a-f]{8}\.(?:js|html)$/;

/**
 * The runtime keys that may be fetched by path — `/c/u/…` on the ad domain and the
 * app — which is scripts only. A SIMID document is HTML and is only ever served
 * through `/c/s/:token` with its own CSP; forwarding it raw would render it as a
 * page on our origin with none.
 */
export const RUNTIME_SCRIPT_KEY_RE = /^runtime\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.[0-9a-f]{8}\.js$/;
