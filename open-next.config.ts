import { existsSync } from "node:fs";
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * OpenNext for Cloudflare (ADR-0029 §2).
 *
 * The only prerendered routes are the build's own — `/icon`, `/opengraph-image`,
 * `/robots.txt`, the error page — and nothing revalidates (the sitemap is
 * per-request), so the read-only static-assets cache is enough: the build's
 * copies are served from the Worker's assets, and there is no R2 bucket, queue
 * or Durable Object to run for an incremental cache this app does not use.
 */

/**
 * The build copies these files into the Worker and loads them into the
 * deployed app's `process.env`. Next to `.env.local` that ships the service-role
 * key, the Stripe secret, the deploy token and a real account's password — so
 * the build refuses to run beside any of them. It runs in CI, where none exists.
 */
const BUNDLED_ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];
const present = BUNDLED_ENV_FILES.filter((file) => existsSync(file));
if (present.length > 0) {
  throw new Error(
    `Refusing to build the app Worker beside ${present.join(", ")}: OpenNext would bundle ` +
      "them into the deployed Worker. The app Worker is built and deployed by CI only (ADR-0029).",
  );
}

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
