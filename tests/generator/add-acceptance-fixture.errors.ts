/** Keeps native scaffold fixture failures typed while preserving their original native Cause. */
import { Data } from "effect";

export class AddFixtureFailure extends Data.TaggedError("AddFixtureFailure")<{
  /** Fixed finite fixture operation that failed. */
  readonly operation: string;
  /** Native failure provenance preserved without promoting arbitrary values into the domain channel. */
  readonly cause: Error;
}> {}
