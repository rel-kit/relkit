import { Deferred, Effect } from "effect";
import type { NativeJobsState } from "./native-jobs.types.js";

/**
 * Publishes state availability without buffers or wall-clock polling.
 * @param value Owner state whose previous waiters should resume.
 * @returns Nothing; each observer next pull captures the replacement Deferred.
 */
export function notifyNativeJobs(value: NativeJobsState): void {
  const previous = value.changed;
  value.changed = Deferred.makeUnsafe();
  Deferred.doneUnsafe(previous, Effect.void);
}
