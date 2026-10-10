/**
 * Describes expected snapshot rejection without exposing cached source or secrets.
 * The dev dispatcher can select full validation for these failures. Defects and
 * interruption remain distinct and must never be classified as cache misses.
 */
import { Data } from "effect";

/** Expected receipt incompatibility, divergence or unsafe persisted content. */
export class DevSnapshotRejected extends Data.TaggedError("DevSnapshotRejected")<{
  /** Stable rejection category used to choose the safe validation path. */
  readonly reason: "missing" | "malformed" | "incompatible" | "stale" | "integrity" | "ineligible";
  /** Bounded operation label; never cached source bytes or environment values. */
  readonly operation: string;
}> {}

/** Native input/artifact access failed without granting authority to partial bytes. */
export class DevSnapshotIoError extends Data.TaggedError("DevSnapshotIoError")<{
  /** Bounded adapter operation label used for safe diagnostics. */
  readonly operation: string;
  /** Normalized native failure; the original rejection remains in Error.cause. */
  readonly cause: Error;
}> {}
