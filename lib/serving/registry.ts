import type { SnapshotNamespace } from "./kv";

/**
 * Where a Worker entry registers its KV binding for the snapshot store
 * (ADR-0029), kept in a module with no dependencies so an entry can import it
 * without pulling the store — and the Blob SDK behind it — into its bundle.
 *
 * The registration lives on a global symbol rather than in a module variable: a
 * Worker can hold more than one copy of the serving modules (the Next server
 * bundle and the entry that wraps it are compiled separately), and every copy
 * must see the same registration.
 */
const SLOT = Symbol.for("creosmith.serving.snapshot-namespace");

type Slots = Record<symbol, SnapshotNamespace | undefined>;

/** Called by a Worker entry, with its KV binding, before it serves. */
export function registerSnapshotNamespace(namespace: SnapshotNamespace): void {
  (globalThis as unknown as Slots)[SLOT] = namespace;
}

/** The registered binding, or undefined outside a Worker. */
export function registeredSnapshotNamespace(): SnapshotNamespace | undefined {
  return (globalThis as unknown as Slots)[SLOT];
}
