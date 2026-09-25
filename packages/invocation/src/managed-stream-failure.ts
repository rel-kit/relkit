import { Effect } from "effect";
import { observeInvocation } from "./invocation-observability.js";
import {
  RelkitStreamError,
  runStreamPromise,
  StreamLifecycleFailure,
  StreamSourceFailure,
} from "./stream-errors.js";
import type { ManagedEffectIterator } from "./managed-stream.types.js";

/** Builds a consumed iterator inside its parent stream-open operation.
 * @returns An iterator whose next Effect fails by tag.
 * @example Effect.runSync(failingManagedIteratorEffect<number>());
 */
export function failingManagedIteratorEffect<T>(): Effect.Effect<ManagedEffectIterator<T>> {
  return Effect.sync(() => {
    const nextEffect = (): Effect.Effect<IteratorResult<T>, StreamLifecycleFailure> =>
      observeInvocation(
        "stream.managed-next",
        Effect.fail(
          new StreamLifecycleFailure({
            code: "RELKIT_STREAM_ALREADY_CONSUMED",
            message: "A stream can be consumed once",
          }),
        ),
      );
    return { nextEffect, next: () => runStreamPromise(nextEffect()) };
  });
}

/** Converts a typed stream failure to its established public error shape.
 * @param failure - Typed validation, lifecycle, or source failure.
 * @returns The public error or original source cause.
 * @example publicStreamError(new StreamLifecycleFailure({ code: "RELKIT_STREAM_CONSUMER_IDLE", message: "idle" }));
 */
export function publicStreamError(failure: StreamLifecycleFailure | StreamSourceFailure): unknown {
  if (failure instanceof StreamSourceFailure) return failure.cause;
  if (failure.code === "RELKIT_STREAM_ITEM_VALIDATION" || failure.code === "RELKIT_STREAM_ITEM_ENCODING")
    return new TypeError(failure.message);
  return new RelkitStreamError(failure.code, failure.message);
}
