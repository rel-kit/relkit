import {
  resolveJobProcedure,
  ownJobProcedure,
  optionalJobProcedure,
  isProcedureNotFound,
  toAsyncIterator,
  asWatchFrame,
  isRunSnapshot,
  throwIfAborted,
} from "./reconcile-boundary.js";
export { resolveJobProcedure, ownJobProcedure } from "./reconcile-boundary.js";
import type { WatchRequest } from "./reconcile.types.js";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { JobWatchOptions } from "./types.js";
import { timedCall } from "./read-timeout.js";
import { closeIterator, newEpoch } from "./reconcile-support.js";
export type { WatchRequest } from "./reconcile.types.js";

/**
 * Builds the existing run observation request without widening identity authority.
 * @param options - Existing public configuration and authority.
 * @param after - Retained authoritative cursor.
 * @returns The run, cursor and expected identity request.
 */
export function watchRequest(options: JobWatchOptions, after = options.after): WatchRequest {
  return {
    runId: options.runId,
    ...(after === undefined ? {} : { after }),
    ...(options.expectedIdentity === undefined
      ? {}
      : { expectedIdentity: options.expectedIdentity }),
  };
}
/**
 * Reads and closes a temporary native watch used for authoritative fallback.
 * @param client - Borrowed generated procedure client.
 * @param name - Declared resource or selector identity.
 * @param request - Existing request and authorization authority.
 * @param signal - Borrowed caller cancellation signal.
 * @param timeoutMs - Existing read or establishment deadline in milliseconds.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function readFirstWatchFrame(
  client: unknown,
  name: string,
  request: WatchRequest,
  signal: AbortSignal,
  timeoutMs = 10_000,
): Promise<RunWatchFrame | undefined> {
  throwIfAborted(signal);
  const controller = new AbortController();
  const owned = AbortSignal.any([signal, controller.signal]);
  let iterator: AsyncIterator<unknown> | undefined;
  try {
    iterator = await openWatchIterator(client, name, request, owned, timeoutMs);
    const result = await timedCall(owned, timeoutMs, () => iterator!.next());
    throwIfAborted(owned);
    return result.done === true ? undefined : asWatchFrame(result.value);
  } finally {
    controller.abort();
    if (iterator !== undefined) await closeIterator(iterator);
  }
}

/**
 * Bounds native watch establishment and preserves the supplied lifetime signal.
 * @param client - Borrowed generated procedure client.
 * @param name - Declared resource or selector identity.
 * @param request - Existing request and authorization authority.
 * @param signal - Borrowed caller cancellation signal.
 * @param timeoutMs - Existing read or establishment deadline in milliseconds.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function openWatchIterator(
  client: unknown,
  name: string,
  request: WatchRequest,
  signal: AbortSignal,
  timeoutMs = 10_000,
): Promise<AsyncIterator<unknown>> {
  throwIfAborted(signal);
  const call = resolveJobProcedure(client, name, "watch");
  const value = await timedCall(signal, timeoutMs, async () => {
    const result = await call(request, { signal });
    if (signal.aborted) await closeIterator(toAsyncIterator(result));
    return result;
  });
  throwIfAborted(signal);
  return toAsyncIterator(value);
}

/**
 * Reads authoritative run state, falling back to watch only for a missing get procedure.
 * @param client - Borrowed generated procedure client.
 * @param name - Declared resource or selector identity.
 * @param options - Existing public configuration and authority.
 * @param signal - Borrowed caller cancellation signal.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export async function authoritativeFrame(
  client: unknown,
  name: string,
  options: JobWatchOptions,
  signal: AbortSignal,
): Promise<RunWatchFrame | undefined> {
  const get = ownJobProcedure(client, name, "get") ?? optionalJobProcedure(client, name, "get");
  if (get === undefined) {
    return readFirstWatchFrame(client, name, watchRequest(options), signal, options.readTimeoutMs);
  }
  try {
    throwIfAborted(signal);
    const run = await timedCall(signal, options.readTimeoutMs ?? 10_000, (readSignal) =>
      get(
        {
          runId: options.runId,
          ...(options.expectedIdentity === undefined
            ? {}
            : { expectedIdentity: options.expectedIdentity }),
        },
        { signal: readSignal },
      ),
    );
    throwIfAborted(signal);
    if (!isRunSnapshot(run)) throw new TypeError("Job get returned an invalid run snapshot.");
    return frameFromRun(run);
  } catch (error) {
    if (!isProcedureNotFound(error)) throw error;
    return readFirstWatchFrame(client, name, watchRequest(options), signal, options.readTimeoutMs);
  }
}

/**
 * Projects an authoritative run into the existing frozen snapshot frame.
 * @param run - Authoritative run payload.
 * @returns A frozen state-continuity snapshot frame.
 */
export function frameFromRun(run: RunSnapshot): RunWatchFrame {
  return Object.freeze({
    kind: "snapshot",
    run,
    observedAt: run.observedAt,
    epoch: newEpoch(),
    sequence: 0,
    continuity: "state",
  });
}

export { closeIterator, newEpoch } from "./reconcile-support.js";
