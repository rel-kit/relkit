/** Defines expected native tutorial failures without losing the failed operation. */
import { Data } from "effect";

/** An owned tutorial command, request or contract check failed and cannot certify the example. */
export class TutorialFailure extends Data.TaggedError("TutorialFailure")<{
  /** Fixed tutorial stage used to locate the failed native operation. */
  readonly operation: string;
  /** Controlled native or assertion explanation retained for local acceptance diagnostics. */
  readonly message: string;
}> {}
