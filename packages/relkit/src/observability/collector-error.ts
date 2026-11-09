import { Schema } from "effect";

/**
 * Invalid collector configuration or redaction policy.
 *
 * @example
 * Effect.runSync(makeObservabilityCollectorEffect({ maxRecords: 0 }).pipe(
 *   Effect.catchTag("ObservabilityCollectorError", (error) => Effect.succeed(error.reason)),
 * ));
 */
export class ObservabilityCollectorError extends Schema.TaggedError<ObservabilityCollectorError>()(
  "ObservabilityCollectorError",
  {
    reason: Schema.Literals(["maxRecords", "duplicateSignals", "signal", "redaction"]),
    message: Schema.String,
  },
) {}

/**
 * Builds a typed collector validation error.
 *
 * @param reason - The bounded validation category.
 * @param message - An existing compatibility message for redaction failures.
 * @returns A tagged failure suitable for the Effect error channel.
 * @example
 * const error = invalidCollectorOptions("maxRecords");
 */
export function invalidCollectorOptions(
  reason: "maxRecords" | "duplicateSignals" | "signal" | "redaction",
  message?: string,
): ObservabilityCollectorError {
  return new ObservabilityCollectorError({
    reason,
    message:
      message ??
      (reason === "maxRecords"
        ? "Observability collector maxRecords must be a positive safe integer"
        : reason === "duplicateSignals"
          ? "Observability collector signals must be unique"
          : reason === "signal"
            ? "Observability collector signal is invalid"
            : "Observability collector redaction policy is invalid"),
  });
}
