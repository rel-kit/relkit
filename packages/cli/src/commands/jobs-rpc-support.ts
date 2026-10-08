import { ORPCError } from "@relkit/client";
import { Schema } from "effect";
import { JobsCommandError } from "./jobs-error.js";
import { JobsRecordSchema } from "./jobs.schemas.js";
import type { JobsUnknownReceipt } from "./jobs.types.js";

/**
 * Preserves ambiguous mutation recovery identifiers without retrying submission.
 * @param error - Original oRPC rejection.
 * @param operationId - Existing caller or generated operation identity.
 * @param idempotencyKey - Optional original idempotency key.
 * @returns Existing request or ambiguous-submission diagnostic.
 */
export function triggerError(
  error: unknown,
  operationId: string,
  idempotencyKey: string | undefined,
): JobsCommandError {
  if (error instanceof ORPCError && !isUnknown(error))
    return new JobsCommandError("RELKIT_JOBS_REQUEST_FAILED", `${error.code}: ${error.message}`);
  const unknown = unknownReceipt(error);
  const details = [
    `operationId=${unknown?.operationId ?? operationId}`,
    ...(unknown?.idempotencyKey === undefined
      ? idempotencyKey === undefined
        ? []
        : [`idempotencyKey=${idempotencyKey}`]
      : [`idempotencyKey=${unknown.idempotencyKey}`]),
  ];
  return new JobsCommandError(
    "RELKIT_JOB_SUBMISSION_UNKNOWN",
    `Job trigger outcome is unknown; ${details.join(", ")}. Retry with the same operation/key.`,
  );
}

/**
 * Resolves public names from compiler/server definition projections.
 * @param values - Untrusted definition list.
 * @param jobId - Existing ID, durable ID or name.
 * @returns Optional declared public name.
 */
export function findJobName(values: unknown, jobId: string): string | undefined {
  if (!Array.isArray(values)) return undefined;
  const value: unknown = values.find((entry: unknown) => {
    const item = jobsRecord(entry);
    return item !== undefined && (item.id === jobId || item.jobId === jobId || item.name === jobId);
  });
  return jobsText(jobsRecord(value)?.name);
}

/**
 * Narrows unknown object JSON while retaining its original identity.
 * @param value - Untrusted JSON value.
 * @returns The accepted record, excluding arrays and primitive values.
 */
export function jobsRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return Schema.is(JobsRecordSchema)(value) ? value : undefined;
}

/**
 * Selects existing nonempty public text without coercion.
 * @param value - Untrusted JSON field.
 * @returns The original nonempty string when accepted.
 */
export function jobsText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Classifies the existing ambiguous native procedure outcomes.
 * @param error - Original oRPC error.
 * @returns Whether submission may already have been accepted.
 */
function isUnknown(error: ORPCError<string, unknown>): boolean {
  return (
    error.code === "RELKIT_JOB_SUBMISSION_UNKNOWN" ||
    unknownReceipt(error) !== undefined ||
    [
      "BAD_GATEWAY",
      "CLIENT_CLOSED_REQUEST",
      "GATEWAY_TIMEOUT",
      "INTERNAL_SERVER_ERROR",
      "MALFORMED_ORPC_RESPONSE",
    ].includes(error.code)
  );
}

/**
 * Reads recovery identifiers from the declared native error payload.
 * @param error - Original oRPC rejection.
 * @returns An accepted receipt with unchanged operation/key values.
 */
function unknownReceipt(error: unknown): JobsUnknownReceipt | undefined {
  const candidate = error instanceof ORPCError ? jobsRecord(error.data) : undefined;
  const operationId = jobsText(candidate?.operationId);
  if (operationId === undefined) return undefined;
  const idempotencyKey = jobsText(candidate?.idempotencyKey);
  return { operationId, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) };
}
