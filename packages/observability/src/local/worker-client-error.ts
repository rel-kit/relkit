import { Schema } from "effect";
import { ObservabilityQueryError } from "../query-types.js";

/**
 * A local worker creation, IPC, timeout, or response failure.
 *
 * @example
 * Effect.runPromise(worker.call(command).pipe(
 *   Effect.catchTag("LocalWorkerError", (error) => Effect.succeed(error.reason)),
 * ));
 */
export class LocalWorkerError extends Schema.TaggedError<LocalWorkerError>()("LocalWorkerError", {
  reason: Schema.Literals(["start", "closed", "send", "timeout", "worker", "response"]),
  message: Schema.String,
  code: Schema.optionalKey(
    Schema.Literals([
      "RELKIT_OBSERVABILITY_QUERY_INVALID",
      "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
    ]),
  ),
}) {}

/** Failure raised by the IPC transport before mapping to the Effect channel. */
export class WorkerTransportError extends Error {
  constructor(
    readonly reason: "send" | "timeout" | "response",
    message: string,
  ) {
    super(message);
  }
}

/** Maps an IPC failure to a tagged worker error without losing query codes. */
export const workerFailure = (
  error: unknown,
  reason: LocalWorkerError["reason"],
): LocalWorkerError =>
  new LocalWorkerError({
    reason: error instanceof WorkerTransportError ? error.reason : reason,
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof ObservabilityQueryError ? { code: error.code } : {}),
  });
