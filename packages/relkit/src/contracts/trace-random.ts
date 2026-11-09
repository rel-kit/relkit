import { Context, Data, Effect, Layer } from "effect";
import type { TraceRandomService } from "./trace-random.types.js";

export type { TraceRandomService } from "./trace-random.types.js";

/**
 * Tagged failure when the platform cannot provide secure random bytes.
 * `cause` preserves the platform error for diagnostics.
 * @example Effect.catchTag("TraceRandomError", (error) => Effect.logWarning(error.message));
 */
export class TraceRandomError extends Data.TaggedError("TraceRandomError")<{
  readonly cause: unknown;
}> {
  override get message(): string {
    return "Secure randomness is unavailable";
  }
}

/**
 * Effect dependency for secure trace identifier generation.
 * @example Effect.provide(createTraceIdEffect(), TraceRandomLive);
 */
export class TraceRandom extends Context.Service<TraceRandom, TraceRandomService>()(
  "relkit/contracts/TraceRandom",
) {}

/**
 * Browser and Bun compatible cryptographic byte source.
 * @example Effect.runSync(Effect.provide(createTraceIdEffect(), TraceRandomLive));
 */
export const TraceRandomLive = Layer.succeed(TraceRandom, {
  fill: (bytes) =>
    Effect.try({
      try: () => {
        crypto.getRandomValues(bytes);
      },
      catch: (cause) => new TraceRandomError({ cause }),
    }),
});
