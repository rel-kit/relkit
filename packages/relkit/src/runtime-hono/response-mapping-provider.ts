/** Records the cause of an internal failure in the log and the trace, never in the response. */
import { frameworkTrace } from "../invocation/index.js";
import { toFailureTelemetry, type InvocationFailure } from "../runtime-effect/index.js";
import { Effect } from "effect";
import type { ResponseMode } from "./response-mapping.types.js";

/** OpenTelemetry exception attributes of one recorded failure. */
interface ExceptionAttributes {
  readonly "exception.type": string;
  readonly "exception.message"?: string;
  readonly "exception.stacktrace"?: string;
}

/** Writes one error log record and one `exception` event on the request span for a provider or
 * defect failure. Development records the redacted cause (name, message, stack); every other
 * mode records only the failure's identity, without message text.
 * @param failure - Normalized invocation failure whose private cause may contain diagnostics.
 * @param mode - Configured runtime exposure mode.
 * @returns An effect that records the failure; it never fails.
 */
export const recordInternalFailure = Effect.fn("ResponseMapping.recordInternalFailure")(function* (
  failure: InvocationFailure,
  mode: ResponseMode | undefined,
) {
  if (failure.kind !== "provider" && failure.kind !== "defect") return;
  const exception =
    mode === "development"
      ? (developmentException(failure) ?? { "exception.type": failure._tag })
      : { "exception.type": failure._tag };
  frameworkTrace.event("exception", { ...exception });
  const message =
    exception["exception.message"] === undefined
      ? `Request failed: ${exception["exception.type"]} (${failure.code}).`
      : `${exception["exception.type"]}: ${exception["exception.message"]}`;
  yield* Effect.logError(message).pipe(
    Effect.annotateLogs({
      ...exception,
      "relkit.error.code": failure.code,
      "relkit.error.kind": failure.kind,
    }),
  );
});

/** Reads the redacted cause of a failure as exception attributes.
 * @param failure - Normalized invocation failure.
 * @returns Name, redacted message and stack of the cause, or undefined when none is recorded.
 */
function developmentException(failure: InvocationFailure): ExceptionAttributes | undefined {
  const internal = toFailureTelemetry(failure, { mode: "development" }).internal;
  const cause: unknown = internal?.cause;
  if (cause === null || typeof cause !== "object" || Array.isArray(cause)) return undefined;
  const { name, message, stack: causeStack } = cause as Readonly<Record<string, unknown>>;
  const stack = typeof causeStack === "string" ? causeStack : internal?.stack;
  return {
    "exception.type": typeof name === "string" ? name : failure._tag,
    ...(typeof message === "string"
      ? { "exception.message": withoutQueryParameters(message) }
      : {}),
    ...(typeof stack === "string" ? { "exception.stacktrace": withoutQueryParameters(stack) } : {}),
  };
}

/** Masks the bound parameters a database driver appends to a failed query's message
 * (`Failed query: … params: …`), so recorded values never include request data.
 * @param text - Redacted message or stack.
 * @returns The text with every `params:` list replaced by a marker.
 */
export function withoutQueryParameters(text: string): string {
  return text.replace(/\bparams:[^\n]*/gi, "params: [REDACTED]");
}
