import type { JobWatchListener, JobWatchOptions, JobWatchState } from "./types.js";

export function notify<Run>(listener: JobWatchListener<Run>, state: JobWatchState<Run>): void {
  try {
    listener(state);
  } catch {
    // Subscriber failures are isolated from the controller and native feed.
  }
}

export function freeze<T>(value: T): T {
  return deepFreeze(value, new WeakSet<object>());
}

export function resumedOptions<Run>(options: JobWatchOptions, state: JobWatchState<Run>): JobWatchOptions {
  return state.cursor === undefined ? options : { ...options, after: state.cursor };
}

export function reconnectAfterTeardown(
  previous: Promise<void> | undefined,
  teardown: Promise<void> | undefined,
  start: () => Promise<void>,
): Promise<void> {
  if (previous === undefined && teardown === undefined) return start();
  return (previous?.catch(() => undefined) ?? Promise.resolve()).then(() => teardown).then(start);
}

function deepFreeze<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}
