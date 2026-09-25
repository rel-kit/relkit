import type { JsonValue } from "@relkit/contracts";
import type { ObservabilityCollector } from "./collector.js";
import type { ObservabilityRecord } from "./model.js";
import type { RedactionPolicy } from "./redaction.js";
import type {
  OBSERVABILITY_STREAM_EVENT_TYPES,
  OBSERVABILITY_STREAM_PROTOCOL,
  OBSERVABILITY_STREAM_VERSION,
} from "./stream-types.js";
/** Event names supported by the observability stream protocol. */
export type ObservabilityStreamEventType = (typeof OBSERVABILITY_STREAM_EVENT_TYPES)[number];
/** Policy applied when a subscriber queue reaches capacity. */
export type ObservabilityStreamOverflow = "drop-oldest" | "drop-newest" | "disconnect";
/** One JSON-safe event with a monotonic cursor. */
export interface ObservabilityStreamEvent {
  readonly protocol: typeof OBSERVABILITY_STREAM_PROTOCOL;
  readonly version: typeof OBSERVABILITY_STREAM_VERSION;
  readonly cursor: string;
  readonly type: ObservabilityStreamEventType;
  readonly data: JsonValue;
}
/** Event payload accepted for publication. */
export type ObservabilityStreamInput =
  | { readonly type: ObservabilityStreamEventType; readonly data: unknown }
  | { readonly type: ObservabilityStreamEventType; readonly record: ObservabilityRecord };
/** Cursor and type filters for a replay request. */
export interface ObservabilityStreamReplayOptions {
  readonly cursor?: string;
  readonly afterCursor?: string;
  readonly limit?: number;
  readonly type?: ObservabilityStreamEventType;
}
/** A bounded page of retained stream events. */
export interface ObservabilityStreamPage {
  readonly protocol: typeof OBSERVABILITY_STREAM_PROTOCOL;
  readonly version: typeof OBSERVABILITY_STREAM_VERSION;
  readonly events: readonly ObservabilityStreamEvent[];
  readonly nextCursor?: string;
  readonly earliestCursor?: string;
  readonly latestCursor: string;
}
/** Start cursor, queue capacity, and overflow policy for a subscriber. */
export interface ObservabilityStreamSubscriptionOptions {
  readonly cursor?: string;
  readonly afterCursor?: string;
  readonly queueSize?: number;
  readonly overflow?: ObservabilityStreamOverflow;
  readonly backpressure?: ObservabilityStreamOverflow;
}
/** Queue and cursor state of one subscriber. */
export interface ObservabilityStreamSubscriptionStats {
  readonly queued: number;
  readonly dropped: number;
  readonly cursor: string;
  readonly closed: boolean;
}
/** Async iterator that must be closed when no longer consumed. */
export interface ObservabilityStreamSubscription extends AsyncIterableIterator<ObservabilityStreamEvent> {
  readonly id: string;
  readonly close: () => void;
  readonly dropped: () => number;
  readonly stats: () => ObservabilityStreamSubscriptionStats;
}
/** Published and dropped event totals. */
export interface ObservabilityStreamCounters {
  readonly published: number;
  readonly retainedDropped: number;
  readonly subscriberDropped: number;
  readonly dropped: number;
}
/** Retention and subscriber state for the stream. */
export interface ObservabilityStreamStats extends ObservabilityStreamCounters {
  readonly retained: number;
  readonly subscribers: number;
  readonly cursor: string;
  readonly earliestCursor?: string;
}
/** Stream retention, queue, subscriber, and redaction configuration. */
export interface ObservabilityStreamOptions {
  readonly maxEvents?: number;
  readonly queueSize?: number;
  readonly maxQueueSize?: number;
  readonly maxSubscribers?: number;
  readonly overflow?: ObservabilityStreamOverflow;
  readonly backpressure?: ObservabilityStreamOverflow;
  readonly redaction?: RedactionPolicy;
  readonly collector?: Pick<ObservabilityCollector, "collect">;
}
/** Stable error codes surfaced by compatibility stream methods. */
export type ObservabilityStreamErrorCode =
  | "RELKIT_OBSERVABILITY_STREAM_INVALID"
  | "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED"
  | "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE"
  | "RELKIT_OBSERVABILITY_STREAM_CLOSED";
/** Overloaded publisher for raw payloads and admitted records. */
export type ObservabilityStreamPublish = {
  (input: ObservabilityStreamInput): ObservabilityStreamEvent | undefined;
  (
    type: ObservabilityStreamEventType,
    record: ObservabilityRecord,
  ): ObservabilityStreamEvent | undefined;
};
/** Publisher for an already typed record. */
export type ObservabilityStreamRecordPublisher = (
  type: ObservabilityStreamEventType,
  record: ObservabilityRecord,
) => ObservabilityStreamEvent | undefined;
/** Cursor replay with object and positional compatibility forms. */
export type ObservabilityStreamReplay = {
  (options?: ObservabilityStreamReplayOptions): ObservabilityStreamPage;
  (cursor?: string, limit?: number): ObservabilityStreamPage;
};
/** Live bounded stream and subscription manager. */
export interface ObservabilityStream {
  readonly publish: ObservabilityStreamPublish;
  readonly emit: ObservabilityStreamPublish;
  readonly publishRecord: ObservabilityStreamRecordPublisher;
  readonly replay: ObservabilityStreamReplay;
  readonly read: ObservabilityStreamReplay;
  readonly subscribe: (
    options?: ObservabilityStreamSubscriptionOptions,
  ) => ObservabilityStreamSubscription;
  readonly dropped: () => number;
  readonly counters: () => ObservabilityStreamCounters;
  readonly stats: () => ObservabilityStreamStats;
  readonly close: () => void;
}
