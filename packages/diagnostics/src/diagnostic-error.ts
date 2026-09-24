import { Data } from "effect";

/** Expected invalid diagnostic input, with a stable field and message.
 * The synchronous adapters convert this error to TypeError for compatibility.
 * @example new DiagnosticValidationError({ field: "code", message: "Diagnostic code must be a non-empty string" });
 */
export class DiagnosticValidationError extends Data.TaggedError("DiagnosticValidationError")<{
  readonly field: string;
  readonly message: string;
}> {}
