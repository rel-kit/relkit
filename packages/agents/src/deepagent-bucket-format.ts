import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";

const TEXT_MIME_TYPES = new Set(["application/javascript", "application/json", "image/svg+xml"]);

/** Normalizes paging arguments to nonnegative integers.
 * @param offset - Candidate starting position.
 * @param limit - Candidate page size.
 * @returns An Effect with normalized paging values.
 * @example Effect.runSync(normalizedPageEffect(0, 500));
 */
export const normalizedPageEffect = Effect.fn("Agents.bucket.page")(
  (offset: number, limit: number) =>
    Effect.sync(() => ({
      offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
      limit: Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0,
    })),
  (effect) => observeAgent("bucket.page", effect),
);

/** Normalizes paging for existing synchronous callers.
 * @param offset - Candidate starting position.
 * @param limit - Candidate page size.
 * @returns Nonnegative integer paging values.
 * @example normalizedPage(0, 500);
 */
export function normalizedPage(offset = 0, limit = 500): { offset: number; limit: number } {
  return Effect.runSync(normalizedPageEffect(offset, limit));
}

/** Classifies cancellation and timeout control failures.
 * @param cause - Candidate failure.
 * @returns An Effect with a boolean.
 * @example Effect.runSync(isControlFailureEffect(error));
 */
export const isControlFailureEffect = Effect.fn("Agents.bucket.controlFailure")(
  (cause: unknown) =>
    Effect.sync(() => {
      const value = cause as { readonly name?: unknown; readonly code?: unknown };
      return (
        value?.name === "AbortError" ||
        value?.name === "TimeoutError" ||
        value?.code === "ABORT_ERR" ||
        value?.code === "ETIMEDOUT"
      );
    }),
  (effect) => observeAgent("bucket.control-failure", effect),
);

/** Classifies a control failure for existing synchronous callers.
 * @param cause - Candidate failure.
 * @returns Whether it represents cancellation or timeout.
 * @example isControlFailure(error);
 */
export function isControlFailure(cause: unknown): boolean {
  return Effect.runSync(isControlFailureEffect(cause));
}

/** Reads a failure message without requiring an Error instance.
 * @param cause - Candidate failure.
 * @returns An Effect with message text.
 * @example Effect.runSync(errorMessageEffect(error));
 */
export const errorMessageEffect = Effect.fn("Agents.bucket.errorMessage")(
  (cause: unknown) => Effect.sync(() => (cause instanceof Error ? cause.message : String(cause))),
  (effect) => observeAgent("bucket.error-message", effect),
);

/** Reads a failure message for existing synchronous callers.
 * @param cause - Candidate failure.
 * @returns Message text.
 * @example errorMessage(error);
 */
export function errorMessage(cause: unknown): string {
  return Effect.runSync(errorMessageEffect(cause));
}

/** Checks whether a MIME type should be decoded as text.
 * @param mimeType - MIME type.
 * @returns An Effect with a boolean.
 * @example Effect.runSync(isTextMimeTypeEffect("text/plain"));
 */
export const isTextMimeTypeEffect = Effect.fn("Agents.bucket.textMimeType")(
  (mimeType: string) =>
    Effect.sync(() => mimeType.startsWith("text/") || TEXT_MIME_TYPES.has(mimeType)),
  (effect) => observeAgent("bucket.text-mime-type", effect),
);

/** Checks a text MIME type for existing synchronous callers.
 * @param mimeType - MIME type.
 * @returns Whether it should be decoded as text.
 * @example isTextMimeType("text/plain");
 */
export function isTextMimeType(mimeType: string): boolean {
  return Effect.runSync(isTextMimeTypeEffect(mimeType));
}
