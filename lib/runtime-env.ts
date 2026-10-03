/**
 * Which runtime is executing this code — for the few places that must behave
 * differently on a Cloudflare Worker than on Node (ADR-0029).
 *
 * workerd identifies itself through `navigator.userAgent`; Node answers
 * `Node.js/<version>` there, and browsers their own string. It is a property of
 * the runtime, not of a request, so nothing a client sends can change it.
 */
export function isWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}
