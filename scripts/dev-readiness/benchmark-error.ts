/**
 * Names operational benchmark failures without treating HTTP connection refusal
 * as application readiness. Native causes remain available for diagnosis; the
 * benchmark reports safe operation labels instead of logging raw child inputs.
 */
import { Data } from "effect";

/** Native measurement or report I/O failed; this is never a passing start. */
export class ReadinessBenchmarkError extends Data.TaggedError("ReadinessBenchmarkError")<{
  /** Fixed adapter operation identifying acquisition, probing, cleanup or report I/O. */
  readonly operation: string;
  /** Normalized native failure; its cause is diagnostic data, not automatic log content. */
  readonly cause: Error;
}> {}
