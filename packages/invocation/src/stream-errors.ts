import { Data, Effect } from "effect";

/** Public compatibility error for stream lifecycle violations.
 * @example new RelkitStreamError("RELKIT_STREAM_ALREADY_CONSUMED", "Already consumed");
 */
export class RelkitStreamError extends Error {
  constructor(
    readonly code:
      | "RELKIT_STREAM_ALREADY_CONSUMED"
      | "RELKIT_STREAM_ITEM_TOO_LARGE"
      | "RELKIT_STREAM_CONSUMER_IDLE",
    message: string,
  ) {
    super(message);
    this.name = "RelkitStreamError";
  }
}

/** Tagged failure for a stream lifecycle rule.
 * @example Effect.catchTag(iterator.nextEffect(), "StreamLifecycleFailure", () => Effect.void);
 */
export class StreamLifecycleFailure extends Data.TaggedError("StreamLifecycleFailure")<{
  readonly code:
    RelkitStreamError["code"] | "RELKIT_STREAM_ITEM_VALIDATION" | "RELKIT_STREAM_ITEM_ENCODING";
  readonly message: string;
}> {}

/** Tagged failure from an external async iterator or settlement callback.
 * @example Effect.catchTag(iterator.nextEffect(), "StreamSourceFailure", () => Effect.void);
 */
export class StreamSourceFailure extends Data.TaggedError("StreamSourceFailure")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Runs a stream Effect while restoring public error shapes.
 * @param effect - Iterator operation to run.
 * @returns The iterator operation's result.
 * @throws RelkitStreamError, TypeError, or the original external failure.
 * @example runStreamPromise(Effect.succeed({ value: 1, done: false }));
 */
export async function runStreamPromise<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  try {
    return await Effect.runPromise(effect);
  } catch (cause) {
    if (cause instanceof StreamLifecycleFailure) {
      if (
        cause.code === "RELKIT_STREAM_ITEM_VALIDATION" ||
        cause.code === "RELKIT_STREAM_ITEM_ENCODING"
      )
        throw new TypeError(cause.message);
      throw new RelkitStreamError(cause.code, cause.message);
    }
    if (cause instanceof StreamSourceFailure) throw cause.cause;
    throw cause;
  }
}
