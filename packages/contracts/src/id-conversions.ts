import { Effect } from "effect";
import { observeContract, runContract } from "./contract-observability.js";
import { normalizeProtocolIdEffect, StableIdError } from "./id.js";
import { isTraceIdEffect, TraceIdError } from "./trace-context.js";
import type {
  EventInstanceId,
  GenerationId,
  GraphHash,
  InvocationId,
  RequestId,
  TraceId,
} from "./id.types.js";

/**
 * Converts an explicit hash ID to its nominal graph type.
 * @param value - Candidate graph hash.
 * @returns The typed hash or a StableIdError.
 * @example Effect.runSync(toGraphHashEffect("graph-1"));
 */
export function toGraphHashEffect(value: unknown): Effect.Effect<GraphHash, StableIdError> {
  return observeContract(
    "id.to-graph-hash",
    Effect.map(normalizeProtocolIdEffect(value), (id) => id as unknown as GraphHash),
  );
}

/**
 * Synchronous adapter for graph hash conversion.
 * @param value - Candidate graph hash.
 * @returns The typed hash.
 * @throws StableIdError for invalid input.
 * @example toGraphHash("graph-1");
 */
export function toGraphHash(value: unknown): GraphHash {
  return runContract(toGraphHashEffect(value));
}

/**
 * Converts an explicit generation ID to its nominal type.
 * @param value - Candidate generation ID.
 * @returns The typed ID or a StableIdError.
 * @example Effect.runSync(toGenerationIdEffect("generation-1"));
 */
export function toGenerationIdEffect(value: unknown): Effect.Effect<GenerationId, StableIdError> {
  return observeContract(
    "id.to-generation-id",
    Effect.map(normalizeProtocolIdEffect(value), (id) => id as unknown as GenerationId),
  );
}

/**
 * Synchronous adapter for generation ID conversion.
 * @param value - Candidate generation ID.
 * @returns The typed ID.
 * @throws StableIdError for invalid input.
 * @example toGenerationId("generation-1");
 */
export function toGenerationId(value: unknown): GenerationId {
  return runContract(toGenerationIdEffect(value));
}

/**
 * Converts an explicit request ID to its nominal type.
 * @param value - Candidate request ID.
 * @returns The typed ID or a StableIdError.
 * @example Effect.runSync(toRequestIdEffect("request-1"));
 */
export function toRequestIdEffect(value: unknown): Effect.Effect<RequestId, StableIdError> {
  return observeContract(
    "id.to-request-id",
    Effect.map(normalizeProtocolIdEffect(value), (id) => id as unknown as RequestId),
  );
}

/**
 * Synchronous adapter for request ID conversion.
 * @param value - Candidate request ID.
 * @returns The typed ID.
 * @throws StableIdError for invalid input.
 * @example toRequestId("request-1");
 */
export function toRequestId(value: unknown): RequestId {
  return runContract(toRequestIdEffect(value));
}

/**
 * Validates a W3C trace ID before applying its nominal type.
 * @param value - Candidate trace ID.
 * @returns The trace ID or a TypeError.
 * @example Effect.runSync(toTraceIdEffect("4bf92f3577b34da6a3ce929d0e0e4736"));
 */
export function toTraceIdEffect(value: unknown): Effect.Effect<TraceId, TraceIdError> {
  return observeContract(
    "id.to-trace-id",
    Effect.gen(function* () {
      if (!(yield* isTraceIdEffect(value))) return yield* Effect.fail(new TraceIdError());
      return value as TraceId;
    }),
  );
}

/**
 * Synchronous adapter for W3C trace ID conversion.
 * @param value - Candidate trace ID.
 * @returns The typed trace ID.
 * @throws TraceIdError for invalid W3C input.
 * @example toTraceId("4bf92f3577b34da6a3ce929d0e0e4736");
 */
export function toTraceId(value: unknown): TraceId {
  return runContract(toTraceIdEffect(value));
}

/**
 * Converts an explicit invocation ID to its nominal type.
 * @param value - Candidate invocation ID.
 * @returns The typed ID or a StableIdError.
 * @example Effect.runSync(toInvocationIdEffect("invocation-1"));
 */
export function toInvocationIdEffect(value: unknown): Effect.Effect<InvocationId, StableIdError> {
  return observeContract(
    "id.to-invocation-id",
    Effect.map(normalizeProtocolIdEffect(value), (id) => id as unknown as InvocationId),
  );
}

/**
 * Synchronous adapter for invocation ID conversion.
 * @param value - Candidate invocation ID.
 * @returns The typed ID.
 * @throws StableIdError for invalid input.
 * @example toInvocationId("invocation-1");
 */
export function toInvocationId(value: unknown): InvocationId {
  return runContract(toInvocationIdEffect(value));
}

/**
 * Converts an explicit event instance ID to its nominal type.
 * @param value - Candidate event instance ID.
 * @returns The typed ID or a StableIdError.
 * @example Effect.runSync(toEventInstanceIdEffect("event-1"));
 */
export function toEventInstanceIdEffect(
  value: unknown,
): Effect.Effect<EventInstanceId, StableIdError> {
  return observeContract(
    "id.to-event-instance-id",
    Effect.map(normalizeProtocolIdEffect(value), (id) => id as unknown as EventInstanceId),
  );
}

/**
 * Synchronous adapter for event instance ID conversion.
 * @param value - Candidate event instance ID.
 * @returns The typed ID.
 * @throws StableIdError for invalid input.
 * @example toEventInstanceId("event-1");
 */
export function toEventInstanceId(value: unknown): EventInstanceId {
  return runContract(toEventInstanceIdEffect(value));
}
