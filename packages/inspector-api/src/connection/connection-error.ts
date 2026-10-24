/**
 * Carries safe operation labels and original native causes across private
 * discovery and bridge adapters. Callers report the label, never raw credentials
 * or rejected descriptor content, and decide recovery at their owning boundary.
 */
import { Data, Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";

/** Expected connection failure; no automatic mutation retry is implied. */
export class InspectionConnectionError extends Data.TaggedError("InspectionConnectionError")<{
  /** Bounded operation/rejection code suitable for logs and operator guidance. */
  readonly operation: string;
  /** Original native failure normalized to Error; do not log without redaction. */
  readonly cause: Error;
}> {}

/**
 * Adapts a single native call without moving policy into Promise orchestration.
 * @typeParam Value - Native success value retained unchanged.
 * @param operation - Fixed connection operation label.
 * @param call - Lazy filesystem/network adapter call.
 * @returns Observed lazy native operation with its original cause retained.
 */
export function connectionAttempt<Value>(operation: string, call: () => PromiseLike<Value>) {
  return observeExecution(
    "inspector",
    `connection.${operation}`,
    Effect.tryPromise({
      try: () => call(),
      catch: (cause) =>
        new InspectionConnectionError({
          operation,
          cause: cause instanceof Error ? cause : new Error("Connection adapter failed", { cause }),
        }),
    }),
    () => ({}),
  );
}

/**
 * Rejects invalid identity, ownership or boundary data without echoing it.
 * @param operation - Safe rejection label.
 * @returns A typed failed effect; performs no I/O.
 */
export function rejectConnection(operation: string) {
  return Effect.fail(
    new InspectionConnectionError({
      operation,
      cause: new Error(`Inspection connection rejected: ${operation}`),
    }),
  );
}
