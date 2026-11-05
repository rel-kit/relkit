import { readRunId } from "./job-hooks-support.js";
import type { RelkitClientRuntime } from "./context.js";
import { RelkitWriteError } from "./write-error.js";

/**
 * Requires ready identity authority before an accepted-work dispatch.
 * @param runtime - Existing runtime supplied by the owning operation.
 * @returns The ready, writable identity scope.
 */
export function writableScope(
  runtime: RelkitClientRuntime,
): NonNullable<RelkitClientRuntime["scope"]> {
  if (runtime.status !== "ready" || runtime.scope === undefined || runtime.identity === undefined) {
    throw new RelkitWriteError("not-sent", `RelKit client is not ready (${runtime.status})`);
  }
  return runtime.scope;
}

/**
 * Retains the existing run reference in a job control receipt.
 * @param input - Exact transmitted request input.
 * @returns The existing optional run reference.
 */
export function controlReferences(input: unknown): { readonly runId?: string } {
  const runId = readRunId(input);
  return runId === undefined ? {} : { runId };
}

/**
 * Reads the browser online hint synchronously without acquiring resources.
 * @returns Whether the browser explicitly reports being offline.
 */
export function offline(): boolean {
  return (globalThis as { navigator?: { readonly onLine?: boolean } }).navigator?.onLine === false;
}
