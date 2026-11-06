import { Schema } from "effect";
import {
  ApprovalDeniedError,
  ApprovalRequiredError,
  ApprovalStateError,
} from "./approval-error.js";

/** Tagged failure for an invalid approval or denied execution. */
export class ApprovalEffectError extends Schema.TaggedError<ApprovalEffectError>()(
  "ApprovalEffectError",
  { code: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}

/** Preserves an approval error for typed Effect recovery and compatibility adapters.
 * @param cause - Existing approval or validation error.
 * @returns A tagged error with the original cause.
 * @example approvalEffectError(new ApprovalStateError("invalid state"));
 */
export function approvalEffectError(cause: unknown): ApprovalEffectError {
  const code =
    cause instanceof ApprovalStateError ||
    cause instanceof ApprovalRequiredError ||
    cause instanceof ApprovalDeniedError
      ? cause.code
      : "RELKIT_APPROVAL_INVALID";
  return new ApprovalEffectError({
    code,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
