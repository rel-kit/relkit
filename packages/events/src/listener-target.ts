import type { FunctionDescriptor } from "@zsys/functions";
import {
  validate,
  type StandardIssue,
  type StandardResult,
  type StandardSchemaV1,
} from "@zsys/schema";
import type { EventDescriptorAny, UnknownEventEnvelope } from "./define-event.js";
import type { EventTriggerDescriptor } from "./listener-types.js";

/** @internal Creates the executable target emitted into a generated runtime manifest. */
export function createEventListenerTarget(
  listener: EventTriggerDescriptor,
  contracts: readonly EventDescriptorAny[],
  functionId: string,
): FunctionDescriptor<string, UnknownEventEnvelope, unknown, any> {
  const input = envelopeSchema(listener.selector.kind === "all", contracts);
  return Object.freeze({
    ...listener.target,
    id: functionId,
    ref: Object.freeze({ kind: "function" as const, id: functionId }),
    input,
  }) as FunctionDescriptor<string, UnknownEventEnvelope, unknown, any>;
}

function envelopeSchema(
  allowUnknown: boolean,
  contracts: readonly EventDescriptorAny[],
): StandardSchemaV1<unknown, UnknownEventEnvelope> {
  return Object.freeze({
    "~standard": Object.freeze({
      version: 1 as const,
      vendor: "zsys",
      validate: async (value: unknown): Promise<StandardResult<UnknownEventEnvelope>> => {
        const issue = envelopeIssue(value);
        if (issue !== undefined) return { issues: [issue] };
        const envelope = value as UnknownEventEnvelope;
        const contract = contracts.find(
          (entry) => entry.id === envelope.eventId && entry.version === envelope.version,
        );
        if (contract === undefined) {
          return allowUnknown
            ? { value: envelope }
            : failure(`Event ${envelope.eventId}@${envelope.version} is not selected`);
        }
        const result = await validate(contract.payload, envelope.payload as never);
        if ("issues" in result && result.issues !== undefined) {
          return {
            issues: result.issues.map((entry) => ({
              ...entry,
              path: ["payload", ...(entry.path ?? [])],
            })),
          };
        }
        return { value: Object.freeze({ ...envelope, payload: result.value }) };
      },
    }),
  });
}

function envelopeIssue(value: unknown): StandardIssue | undefined {
  if (!isRecord(value)) return { message: "Expected an event envelope" };
  for (const key of ["instanceId", "eventId", "occurredAt", "publishedAt", "traceId"] as const) {
    if (typeof value[key] !== "string" || value[key] === "") {
      return { message: `Expected ${key} to be a non-empty string`, path: [key] };
    }
  }
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 1) {
    return { message: "Expected version to be a positive integer", path: ["version"] };
  }
  if (!isRecord(value.attributes)) {
    return { message: "Expected attributes to be an object", path: ["attributes"] };
  }
  for (const key of ["key", "correlationId", "causationInvocationId"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      return { message: `Expected ${key} to be a string`, path: [key] };
    }
  }
  return undefined;
}

function failure(message: string): { readonly issues: readonly StandardIssue[] } {
  return { issues: [{ message, path: ["eventId"] }] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
