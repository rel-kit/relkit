/**
 * Reports a compiler-input journal that cannot certify relocatable checking.
 * The error carries only a bounded rejection reason; source text, paths and
 * environment values are deliberately absent from its diagnostic payload.
 */
import { Data } from "effect";

/** Expected prepared-check ineligibility, distinct from native defects. */
export class TypecheckInputError extends Data.TaggedError("TypecheckInputError")<{
  /** A host input changed during checking, escaped containment, or exceeded the budget. */
  readonly reason: "changed" | "escaped" | "oversized" | "unavailable";
  /** Normalized native acquisition failure; absent for domain observation divergence. */
  readonly cause?: Error;
}> {}
