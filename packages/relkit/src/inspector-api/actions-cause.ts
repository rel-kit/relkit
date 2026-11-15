/**
 * Projects the application's own answer to a refused Inspector action: the HTTP status the
 * application would have sent and its safe error code (an access failure id, a declared error id
 * or a failure class), plus the paths of invalid input fields. Messages, data and rejected values
 * never cross, because they can carry application data. Failures that are not an answer from the
 * application (a missing provider registry, an Inspector validation error) have no cause.
 */
import { isAccessFailureId } from "relkit/contracts";
import { isInvocationFailure, normalizeFailure } from "relkit/runtime-effect";
import type { InspectorActionCause } from "./actions.types.js";
import { isRecord } from "./shared.js";

/** Status and code of each non-application failure class, as the HTTP runtime answers them. */
const FAILURE_CLASSES: Readonly<Record<string, Omit<InspectorActionCause, "issues">>> = {
  provider: { status: 502, code: "provider-failure" },
  "provider-failure": { status: 502, code: "provider-failure" },
  cancellation: { status: 499, code: "cancelled" },
  cancelled: { status: 499, code: "cancelled" },
  timeout: { status: 504, code: "timeout" },
};

/** Most invalid fields named in one cause; the application validated all of them. */
const MAX_ISSUES = 20;

/**
 * Selects the application's status and safe code from a native action failure.
 * @param error - Unwrapped native failure of a function invoke, publish or replay.
 * @returns The cause, or undefined when the failure is not the application's answer.
 */
export function applicationCause(error: unknown): InspectorActionCause | undefined {
  if (isInputValidationError(error))
    return { status: 422, code: "validation", issues: safeIssues(error.issues) };
  if (!isInvocationFailure(error)) return undefined;
  const failure = normalizeFailure(error);
  if (failure.kind === "application")
    return {
      status: validStatus(failure.status) ?? (isAccessFailureId(failure.id) ? 403 : 500),
      code: failure.id,
    };
  return FAILURE_CLASSES[failure.outcome] ?? FAILURE_CLASSES[failure.kind] ?? internalError;
}

const internalError = { status: 500, code: "internal-error" } as const;

/**
 * Recognises a failed input validation without importing the engine or the event client: the
 * engine's `InvocationValidationError` of the input phase, or an event client's
 * `EventPayloadValidationError`.
 * @param error - Candidate failure.
 * @returns Whether the application rejected the input with these issues.
 */
function isInputValidationError(
  error: unknown,
): error is { readonly issues: readonly unknown[] } & Error {
  if (!(error instanceof Error) || !Array.isArray((error as { issues?: unknown }).issues))
    return false;
  if (error.name === "EventPayloadValidationError") return true;
  return (
    error.name === "InvocationValidationError" &&
    (error as { readonly phase?: unknown }).phase === "input"
  );
}

/**
 * Keeps each issue's field path and code, never its message or rejected value.
 * @param issues - Standard Schema issues.
 * @returns At most {@link MAX_ISSUES} safe issues.
 */
export function safeIssues(
  issues: readonly unknown[],
): NonNullable<InspectorActionCause["issues"]> {
  return issues.slice(0, MAX_ISSUES).map((issue) => {
    const record = isRecord(issue) ? issue : {};
    const path = Array.isArray(record.path) ? record.path : [];
    return {
      path: path.map((part) => {
        const key = isRecord(part) && "key" in part ? part.key : part;
        return typeof key === "number" ? key : String(key);
      }),
      code: typeof record.code === "string" ? record.code : "validation",
    };
  });
}

/**
 * Accepts an HTTP status code.
 * @param value - Candidate status.
 * @returns The status, or undefined outside 100-599.
 */
function validStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}
