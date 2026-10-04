import type { Effect } from "effect";

/** Substitutable synchronous counter used to verify owner and Layer boundaries. */
export interface CounterService {
  /**
   * Returns the next count as synchronously completable work.
   * @returns A count controlled by the live or test implementation.
   */
  readonly next: () => Effect.Effect<number>;
}
