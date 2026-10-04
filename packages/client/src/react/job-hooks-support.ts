import type { PreparedJobRequest } from "./job-hooks-support.types.js";
import type { ExpectedClientIdentity } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime/operation-id";
export type { PreparedJobRequest } from "./job-hooks-support.types.js";

const preparedByMutationContext = new WeakMap<object, PreparedJobRequest>();

/**
 * Binds a transmitted job request to caller identity and explicit receipt authority.
 * @param value - Original input or payload; its identity is retained where required.
 * @param expectedIdentity - Existing expected identity supplied by the owning operation.
 * @param mutationContext - Existing mutation context supplied by the owning operation.
 * @returns The transmitted request and its bound receipt references.
 */
export function prepareJobRequest(
  value: unknown,
  expectedIdentity: ExpectedClientIdentity,
  mutationContext?: object,
): PreparedJobRequest {
  if (mutationContext !== undefined) {
    const cached = preparedByMutationContext.get(mutationContext);
    if (cached !== undefined) return cached;
  }
  const record = isRecord(value);
  const inputOptions = record && isRecord(value.options) ? value.options : {};
  const operationId = readString(inputOptions.operationId) ?? createOperationId();
  const idempotencyKey = readString(inputOptions.idempotencyKey);
  const prepared = !record
    ? { value, operationId, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) }
    : {
        value: {
          ...value,
          options: { ...inputOptions, operationId },
          ...(value.expectedIdentity === undefined ? { expectedIdentity } : {}),
        },
        operationId,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      };
  if (mutationContext !== undefined) preparedByMutationContext.set(mutationContext, prepared);
  return prepared;
}

/**
 * Selects a caller-supplied operation ID from the existing request shape.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The supplied operation identity, or undefined.
 */
export function readOperationId(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.options)
    ? readString(value.options.operationId)
    : isRecord(value)
      ? readString(value.operationId)
      : undefined;
}

/**
 * Selects the existing run identity from a request.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The supplied run identity, or undefined.
 */
export function readRunId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.runId) : undefined;
}

/**
 * Recognizes a generated trigger selector without rewriting other route names.
 * @param name - Declared resource or selector identity.
 * @returns The generated job name, or undefined for another selector.
 */
export function generatedJobTriggerName(name: string): string | undefined {
  const parts = name.split(".");
  return parts.length === 3 && parts[0] === "jobs" && parts[2] === "trigger" ? parts[1] : undefined;
}

/**
 * Checks whether the existing property-access boundary accepts a supplied value.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns Whether property access is valid for this boundary.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads an optional string property using the existing selective predicate.
 * @param value - Original input or payload; its identity is retained where required.
 * @returns The string property, or undefined when absent or non-string.
 */
function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
