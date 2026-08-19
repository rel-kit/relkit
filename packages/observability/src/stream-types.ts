import { PROTOCOL_VERSION, type JsonValue } from "@zsys/contracts";
import type { ObservabilityCollector } from "./collector.js";
import type { ObservabilityRecord } from "./model.js";
import type { RedactionPolicy } from "./redaction.js";

export const OBSERVABILITY_STREAM_PROTOCOL = "zsys.observability.stream" as const;
export const OBSERVABILITY_STREAM_VERSION = PROTOCOL_VERSION;
export const DEFAULT_STREAM_MAX_EVENTS = 1_024;
export const DEFAULT_STREAM_QUEUE_SIZE = 64;
export const DEFAULT_STREAM_MAX_QUEUE_SIZE = 256;
export const DEFAULT_STREAM_MAX_SUBSCRIBERS = 256;
export const OBSERVABILITY_STREAM_EVENT_TYPES = [
  "request.started",
  "request.completed",
  "log.emitted",
  "span.started",
  "span.completed",
  "job.changed",
  "event.published",
  "event.delivery.changed",
  "generation.changed",
  "diagnostic.changed",
] as const;
export type ObservabilityStreamEventType = (typeof OBSERVABILITY_STREAM_EVENT_TYPES)[number];
export type ObservabilityStreamOverflow = "drop-oldest" | "drop-newest" | "disconnect";

export interface ObservabilityStreamEvent {
  readonly protocol: typeof OBSERVABILITY_STREAM_PROTOCOL;
  readonly version: typeof OBSERVABILITY_STREAM_VERSION;
  readonly cursor: string;
  readonly type: ObservabilityStreamEventType;
  readonly data: JsonValue;
}
export type ObservabilityStreamInput =
  | { readonly type: ObservabilityStreamEventType; readonly data: unknown }
  | { readonly type: ObservabilityStreamEventType; readonly record: ObservabilityRecord };
export interface ObservabilityStreamReplayOptions {
  readonly cursor?: string;
  readonly afterCursor?: string;
  readonly limit?: number;
  readonly type?: ObservabilityStreamEventType;
}
export interface ObservabilityStreamPage {
  readonly protocol: typeof OBSERVABILITY_STREAM_PROTOCOL;
  readonly version: typeof OBSERVABILITY_STREAM_VERSION;
  readonly events: readonly ObservabilityStreamEvent[];
  readonly nextCursor?: string;
  readonly earliestCursor?: string;
  readonly latestCursor: string;
}
export interface ObservabilityStreamSubscriptionOptions {
  readonly cursor?: string;
  readonly afterCursor?: string;
  readonly queueSize?: number;
  readonly overflow?: ObservabilityStreamOverflow;
  readonly backpressure?: ObservabilityStreamOverflow;
}
export interface ObservabilityStreamSubscriptionStats {
  readonly queued: number;
  readonly dropped: number;
  readonly cursor: string;
  readonly closed: boolean;
}
export interface ObservabilityStreamSubscription extends AsyncIterableIterator<ObservabilityStreamEvent> {
  readonly id: string;
  readonly close: () => void;
  readonly dropped: () => number;
  readonly stats: () => ObservabilityStreamSubscriptionStats;
}
export interface ObservabilityStreamCounters {
  readonly published: number;
  readonly retainedDropped: number;
  readonly subscriberDropped: number;
  readonly dropped: number;
}
export interface ObservabilityStreamStats extends ObservabilityStreamCounters {
  readonly retained: number;
  readonly subscribers: number;
  readonly cursor: string;
  readonly earliestCursor?: string;
}
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
export type ObservabilityStreamErrorCode =
  | "ZSYS_OBSERVABILITY_STREAM_INVALID"
  | "ZSYS_OBSERVABILITY_STREAM_CURSOR_EXPIRED"
  | "ZSYS_OBSERVABILITY_STREAM_CURSOR_FUTURE"
  | "ZSYS_OBSERVABILITY_STREAM_CLOSED";
export class ObservabilityStreamError extends TypeError {
  constructor(
    readonly code: ObservabilityStreamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ObservabilityStreamError";
  }
}
export type ObservabilityStreamPublish = {
  (input: ObservabilityStreamInput): ObservabilityStreamEvent | undefined;
  (
    type: ObservabilityStreamEventType,
    record: ObservabilityRecord,
  ): ObservabilityStreamEvent | undefined;
};
export type ObservabilityStreamRecordPublisher = (
  type: ObservabilityStreamEventType,
  record: ObservabilityRecord,
) => ObservabilityStreamEvent | undefined;
export type ObservabilityStreamReplay = {
  (options?: ObservabilityStreamReplayOptions): ObservabilityStreamPage;
  (cursor?: string, limit?: number): ObservabilityStreamPage;
};
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
