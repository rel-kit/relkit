import type { ProtocolId, TraceId } from "./id.types.js";

/** W3C span identifier encoded as sixteen lowercase hexadecimal digits. */
export type SpanId = ProtocolId<"SpanId">;
/** Independently generated identifiers for a local trace and its first span. */
export interface TraceIdentifiers {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
}
/** Role of a span in a distributed trace. */
export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
/** Bounded scalar attributes attached to a trace span. */
export type TraceAttributes = Readonly<Record<string, string | number | boolean>>;

/** Portable trace context carried across process boundaries. */
export interface SpanContext {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
  readonly traceFlags: number;
  readonly traceState?: string;
  readonly remote?: boolean;
}

/** Serializable causation only: never a payload, signal or deadline. */
export interface TracePropagation {
  readonly version: 2;
  readonly producer: SpanContext;
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly correlationId?: string;
  readonly invocationId?: string;
}
