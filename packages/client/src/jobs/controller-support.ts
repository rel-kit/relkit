import type { JobWatchListener, JobWatchOptions, JobWatchState } from "./types.js";

/**
 * Isolates one external-store callback from observation ownership.
 * @typeParam Run - Application-specific observed run payload.
 * @param listener - Borrowed external-store callback.
 * @param state - Current owned state.
 * @returns Nothing; the existing owned state or publication is updated.
 */
export function notify<Run>(listener: JobWatchListener<Run>, state: JobWatchState<Run>): void {
  try {
    listener(state);
  } catch {
    // Subscriber failures are isolated from the controller and native feed.
  }
}

/**
 * Deep-freezes external-store state without cloning its identity.
 * @typeParam T - Input and successful result type.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The same deeply frozen state object.
 */
export function freeze<T>(value: T): T {
  return deepFreeze(value, new WeakSet<object>());
}

/**
 * Adds the retained snapshot cursor to the existing observation options.
 * @typeParam Run - Application-specific observed run payload.
 * @param options - Existing public configuration and authority.
 * @param state - Current owned state.
 * @returns Watch options updated with the retained snapshot cursor.
 */
export function resumedOptions<Run>(
  options: JobWatchOptions,
  state: JobWatchState<Run>,
): JobWatchOptions {
  return state.cursor === undefined ? options : { ...options, after: state.cursor };
}

/**
 * Waits for interrupted setup and cleanup before admitting the next connection.
 * @param previous - Previous first-snapshot Promise.
 * @param teardown - Previous native teardown Promise.
 * @param start - Next connection acquisition callback.
 * @returns A Promise for the existing result, preserving original rejected values.
 */
export function reconnectAfterTeardown(
  previous: Promise<void> | undefined,
  teardown: Promise<void> | undefined,
  start: () => Promise<void>,
): Promise<void> {
  if (previous === undefined && teardown === undefined) return start();
  return (previous?.catch(() => undefined) ?? Promise.resolve()).then(() => teardown).then(start);
}

/**
 * Freezes each reachable state object once, including cyclic structures.
 * @typeParam T - Input and successful result type.
 * @param value - Original input or payload; its identity is retained where required.
 * @param seen - Visited objects used to handle cycles.
 * @returns The same object after reachable objects are frozen once.
 */
function deepFreeze<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}
