/** Retains native process context at the finite scaffold script boundary. */
import { Data } from "effect";
export class ScaffoldProcessFailure extends Data.TaggedError("ScaffoldProcessFailure")<{
  /** Fixed process, HTTP or fixture operation that failed; no user payload is included. */
  readonly operation: string;
  /** Controlled command diagnostics for the test-owned application. */
  readonly message: string;
}> {}
