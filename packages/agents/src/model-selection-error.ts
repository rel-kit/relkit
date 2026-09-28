import { Schema } from "effect";
import type { ModelSelectionErrorCode } from "./model-selection.types.js";

/** Compatible synchronous error for invalid model selection.
 * @example throw new ModelSelectionError("RELKIT_MODEL_SELECTOR_INVALID", "Invalid selector");
 */
export class ModelSelectionError extends TypeError {
  readonly name = "ModelSelectionError";

  constructor(
    readonly code: ModelSelectionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Recoverable Effect failure for invalid model selection. */
export class ModelSelectionEffectError extends Schema.TaggedError<ModelSelectionEffectError>()(
  "ModelSelectionEffectError",
  { code: Schema.String, message: Schema.String, cause: Schema.Unknown },
) {}

/** Captures a selector error for Effect recovery and public compatibility.
 * @param cause - Validation or lookup failure.
 * @returns A tagged error retaining the original cause.
 * @example modelSelectionEffectError(new ModelSelectionError("RELKIT_MODEL_SELECTOR_INVALID", "Invalid"));
 */
export function modelSelectionEffectError(cause: unknown): ModelSelectionEffectError {
  return new ModelSelectionEffectError({
    code: cause instanceof ModelSelectionError ? cause.code : "RELKIT_MODEL_SELECTOR_INVALID",
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
