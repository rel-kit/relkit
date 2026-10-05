import type { Effect } from "effect";
import type { DrizzleFailure } from "./failure.js";

/**
 * Executes work at the existing owner edge; transaction children borrow their parent lease.
 * @typeParam A - Successful result.
 * @param effect - Lazy database work.
 * @param operation - Bounded tracing label.
 * @returns Public Promise result or original native failure.
 */
export type ContextRunner = <A>(
  effect: Effect.Effect<A, DrizzleFailure>,
  operation: string,
) => Promise<A>;
