import type { ExpectedClientIdentity } from "@relkit/contracts";
import { createOperationId } from "@relkit/realtime/operation-id";

export interface PreparedJobRequest {
  readonly value: unknown;
  readonly operationId: string;
  readonly idempotencyKey?: string;
}

const preparedByMutationContext = new WeakMap<object, PreparedJobRequest>();

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

export function readOperationId(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.options)
    ? readString(value.options.operationId)
    : isRecord(value)
      ? readString(value.operationId)
      : undefined;
}

export function readRunId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.runId) : undefined;
}

export function generatedJobTriggerName(name: string): string | undefined {
  const parts = name.split(".");
  return parts.length === 3 && parts[0] === "jobs" && parts[2] === "trigger" ? parts[1] : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
