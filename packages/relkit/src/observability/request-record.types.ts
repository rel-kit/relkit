import type { ObservabilityRecord, RequestOutcome, RequestRecord } from "./model.js";
import type { RedactedCapture } from "./redaction.js";
import type { Effect } from "effect";
import type { RequestRecordError } from "./request-record-effect.js";
/**
 * Capture and collection operations used by request instrumentation.
 * @example
 * const sink: RequestRecordSink = { collect: (record) => records.push(record) };
 */
export interface RequestRecordSink {
  readonly collect: (record: ObservabilityRecord) => unknown;
  readonly capture?: (value: unknown) => RedactedCapture | undefined;
  readonly read?: () => readonly ObservabilityRecord[];
  readonly readRecords?: () => readonly ObservabilityRecord[];
}
/**
 * Request identity and optional clock used to start a lifecycle.
 * The Effect path uses its Clock service when `now` is absent.
 * @example
 * const options: RequestRecordBuilderOptions = {
 *   requestId: "request-1", traceId: "10000000000000000000000000000001", generationId: "gen-1",
 *   graphHash: "sha256:test", method: "GET", rawPath: "/orders",
 * };
 */
export interface RequestRecordBuilderOptions {
  readonly requestId: string;
  readonly traceId: string;
  readonly generationId: string;
  readonly graphHash: string;
  readonly method: string;
  readonly rawPath: string;
  readonly serviceId?: string;
  readonly startedAt?: number;
  readonly requestBytes?: number;
  readonly now?: () => number;
}
/**
 * Optional request lifecycle detail accepted for compatibility.
 * The builder currently records lifecycle summary fields rather than a detail timeline.
 * @example
 * builder.add({ kind: "accepted", at: Date.now() });
 */
export interface RequestDetailInput {
  readonly kind: string;
  readonly at?: number | string;
  readonly durationMs?: number;
  readonly targetId?: string;
  readonly status?: number;
  readonly outcome?: RequestOutcome;
}
/**
 * Completion fields used to create the immutable final request record.
 * @example
 * const finish: RequestFinishOptions = { status: 200, responseBytes: 128 };
 */
export interface RequestFinishOptions {
  readonly status: number;
  readonly completedAt?: number;
  readonly responseBytes?: number;
}
/**
 * Synchronous compatibility builder for one request lifecycle.
 * `finish` returns the same immutable record after the first successful completion.
 * @example
 * const record = builder.finish({ status: 200 });
 */
export interface RequestRecordBuilder {
  readonly started: RequestRecord;
  readonly add: (detail: RequestDetailInput) => void;
  readonly setTraceId: (traceId: string) => void;
  readonly setRoute: (routeId: string, functionId: string) => void;
  readonly setServiceId: (serviceId: string | undefined) => void;
  readonly setInvocationId: (invocationId: string) => void;
  readonly setOutcome: (outcome: RequestOutcome, errorId?: string) => RequestOutcome;
  readonly finish: (options: RequestFinishOptions) => RequestRecord;
}
/**
 * Effect operations for one request lifecycle. `finish` can fail with a
 * tagged `RequestRecordError` when its timestamp is not representable.
 * @example
 * const record = yield* builder.finish({ status: 200 });
 */
export interface RequestRecordBuilderEffects {
  readonly started: RequestRecord;
  readonly add: (detail: RequestDetailInput) => Effect.Effect<void>;
  readonly setTraceId: (traceId: string) => Effect.Effect<void>;
  readonly setRoute: (routeId: string, functionId: string) => Effect.Effect<void>;
  readonly setServiceId: (serviceId: string | undefined) => Effect.Effect<void>;
  readonly setInvocationId: (invocationId: string) => Effect.Effect<void>;
  readonly setOutcome: (outcome: RequestOutcome, errorId?: string) => Effect.Effect<RequestOutcome>;
  readonly finish: (
    options: RequestFinishOptions,
  ) => Effect.Effect<RequestRecord, RequestRecordError>;
}
/**
 * Stable metric label for request builder operations.
 * @example
 * const operation: RequestRecordOperation = "finish";
 */
export type RequestRecordOperation =
  | "create"
  | "add"
  | "setTraceId"
  | "setRoute"
  | "setServiceId"
  | "setInvocationId"
  | "setOutcome"
  | "finish";
