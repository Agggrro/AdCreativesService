/**
 * Access to the Workers KV namespace that holds the serving snapshots (ADR-0029).
 *
 * Two transports, one shape. Inside a Worker the namespace is a binding: a read
 * is served from the data centre's own cache and costs no network hop. Anywhere
 * else — the Node scripts, and the Vercel deployment for as long as the app still
 * runs there — it is the Cloudflare REST API. The store in `store-kv.ts` does not
 * know which one it holds.
 */

/** The three operations the snapshot store needs. */
export interface SnapshotNamespace {
  /** The stored text, or null when the key does not exist. Throws when the read itself failed. */
  get(key: string): Promise<string | null>;
  /** Throws on failure — writes fail hard (lib/serving/store.ts). */
  put(key: string, value: string): Promise<void>;
  /** Idempotent: deleting a key that is not there succeeds. */
  delete(key: string): Promise<void>;
}

/**
 * The part of a Workers `KVNamespace` binding used here, typed structurally so
 * the app does not need `@cloudflare/workers-types` in its global scope.
 */
export interface KvBinding {
  get(key: string, options: { type: "text"; cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Wrap a binding. `cacheTtl` is how long a read — a miss included — may be
 * answered from the data centre's cache: the same 60 s the Blob cache gave, so
 * the kill-switch budget is unchanged (ADR-0015, ADR-0029). KV's floor is 30.
 */
export function bindingNamespace(kv: KvBinding, cacheTtl: number): SnapshotNamespace {
  return {
    get: (key) => kv.get(key, { type: "text", cacheTtl }),
    put: (key, value) => writeWithRetry(() => kv.put(key, value)),
    delete: (key) => writeWithRetry(() => kv.delete(key)),
  };
}

/**
 * KV accepts one write per second per key. The writes that matter most come
 * together for the same user — `checkout.session.completed` with
 * `customer.subscription.created`, a webhook with the reconciler — and a second
 * write inside the same second is refused (429). Refused for that reason, a write
 * is tried again a little over a second later, a few times, with jitter so that
 * writers refused together do not collide again together; refused for any other
 * reason, once. The caller's own re-read (lib/serving/publish.ts) settles which
 * of several writers' values stands. Reads get no retry: a failed read already
 * has its fallback.
 */
export const WRITE_RETRY_DELAY_MS = 1100;
const RATE_LIMITED_ATTEMPTS = 4;

function isRateLimited(err: unknown): boolean {
  return /\b429\b|too many requests/i.test(err instanceof Error ? err.message : String(err));
}

async function writeWithRetry(write: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await write();
      return;
    } catch (err) {
      const limit = isRateLimited(err) ? RATE_LIMITED_ATTEMPTS : 2;
      if (attempt >= limit) throw err;
      const jitter = isRateLimited(err) ? Math.floor(Math.random() * 900) : 0;
      await new Promise((resolve) => setTimeout(resolve, WRITE_RETRY_DELAY_MS + jitter));
    }
  }
}

export interface RestNamespaceOptions {
  accountId: string;
  namespaceId: string;
  /** An API token holding Workers KV Storage: Edit on this account. Never logged. */
  apiToken: string;
  /** Injected by tests. */
  fetch?: typeof fetch;
}

/**
 * Short: the REST API answers in well under a second, and its callers run under
 * ceilings of their own — the Stripe webhook's event claim assumes a bounded run
 * (route.ts maxDuration), with a write retried and a clear behind it.
 */
const REST_TIMEOUT_MS = 4_000;

/** KV over the Cloudflare REST API — for code that runs outside a Worker. */
export function restNamespace(options: RestNamespaceOptions): SnapshotNamespace {
  const doFetch = options.fetch ?? fetch;
  const base =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(options.accountId)}` +
    `/storage/kv/namespaces/${encodeURIComponent(options.namespaceId)}/values/`;
  const auth = { Authorization: `Bearer ${options.apiToken}` };

  // Percent-encoded whole, slashes included: the API reads the rest of the path
  // as one key name, and `serving/creative/<id>.json` must not become a path.
  const url = (key: string) => `${base}${encodeURIComponent(key)}`;

  async function failure(op: string, key: string, response: Response): Promise<Error> {
    // The body is the API's error envelope — codes and messages, never the token.
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    return new Error(`KV ${op} ${key} failed: ${response.status} ${detail}`);
  }

  return {
    async get(key) {
      const response = await doFetch(url(key), {
        headers: auth,
        signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) throw await failure("get", key, response);
      return response.text();
    },

    put(key, value) {
      return writeWithRetry(async () => {
        const response = await doFetch(url(key), {
          method: "PUT",
          headers: { ...auth, "Content-Type": "text/plain; charset=utf-8" },
          body: value,
          signal: AbortSignal.timeout(REST_TIMEOUT_MS),
        });
        if (!response.ok) throw await failure("put", key, response);
        await response.body?.cancel();
      });
    },

    delete(key) {
      return writeWithRetry(async () => {
        const response = await doFetch(url(key), {
          method: "DELETE",
          headers: auth,
          signal: AbortSignal.timeout(REST_TIMEOUT_MS),
        });
        // A key that was never there is the outcome a delete wants.
        if (!response.ok && response.status !== 404) throw await failure("delete", key, response);
        await response.body?.cancel();
      });
    },
  };
}

/**
 * The REST namespace configured by environment, or null when it is not.
 * All three variables or none — a partial set is a misconfiguration, and it is
 * reported rather than silently treated as "no KV".
 */
export function restNamespaceFromEnv(): SnapshotNamespace | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const namespaceId = process.env.SNAPSHOT_KV_NAMESPACE_ID;
  const apiToken = process.env.SNAPSHOT_KV_API_TOKEN;
  if (!accountId && !namespaceId && !apiToken) return null;
  if (!accountId || !namespaceId || !apiToken) {
    throw new Error(
      "Snapshot KV is partly configured: set CLOUDFLARE_ACCOUNT_ID, " +
        "SNAPSHOT_KV_NAMESPACE_ID and SNAPSHOT_KV_API_TOKEN together, or none of them.",
    );
  }
  // Checked here, never echoed: a token with a stray newline or space makes the
  // fetch layer throw an error that quotes the whole header value — the token
  // itself — into whatever log catches it.
  if (!/^[A-Za-z0-9_-]+$/.test(apiToken.trim()) || !/^[0-9a-f]{32}$/i.test(accountId.trim())) {
    throw new Error(
      "Snapshot KV is misconfigured: SNAPSHOT_KV_API_TOKEN or CLOUDFLARE_ACCOUNT_ID " +
        "is not the shape Cloudflare issues (value not shown).",
    );
  }
  return restNamespace({
    accountId: accountId.trim(),
    namespaceId: namespaceId.trim(),
    apiToken: apiToken.trim(),
  });
}
