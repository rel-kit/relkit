import type { Cause, Effect } from "effect";

/** Secondary release evidence, kept separately from the primary operation outcome. */
export interface CleanupIssue {
  readonly operation: string;
  readonly cause: Cause.Cause<unknown>;
}

/** Invocation-owned secondary failure admission and inspection. */
export interface CleanupCapabilities {
  /**
   * Records a cleanup failure without recovering the primary operation.
   * @param operation - Declaration-owned release label.
   * @param cause - Complete release cause, retaining interruption and defects.
   * @returns Lazy admission into this invocation's bounded evidence.
   */
  readonly record: (operation: string, cause: Cause.Cause<unknown>) => Effect.Effect<void>;
  /**
   * Reads the secondary failures belonging to this invocation.
   * @returns An immutable snapshot in release order.
   */
  readonly snapshot: () => Effect.Effect<readonly CleanupIssue[]>;
}
