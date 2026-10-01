import { Schema } from "effect";

/** Expected native boundary failure, translated to a wire failure only at candidate/request edges. */
export class EvaluatorChildBoundaryError extends Schema.TaggedError<EvaluatorChildBoundaryError>()(
  "EvaluatorChildBoundaryError",
  { operation: Schema.String, cause: Schema.Defect() },
) {
  /**
   * Retains the native diagnostic text and the established invalid-request message.
   * @returns The transport diagnostic, with the original rejection retained in cause.
   */
  override get message(): string {
    if (this.operation === "decode-request") {
      return "Evaluator request does not match the supported protocol.";
    }
    return this.cause instanceof Error ? this.cause.message : String(this.cause);
  }
}
