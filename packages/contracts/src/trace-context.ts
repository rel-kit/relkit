import type { ProtocolId, TraceId } from "./id.js";

export type SpanId = ProtocolId<"SpanId">;
export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";
export type TraceAttributes = Readonly<Record<string, string | number | boolean>>;

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

export function isTraceId(value: unknown): value is TraceId {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value) && !/^0+$/.test(value);
}

export function isSpanId(value: unknown): value is SpanId {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value) && !/^0+$/.test(value);
}

export function toSpanId(value: unknown): SpanId {
  if (!isSpanId(value)) throw new TypeError("Invalid W3C span ID");
  return value;
}

export function createTraceId(): TraceId {
  return randomHex(16) as TraceId;
}

export function createSpanId(): SpanId {
  return randomHex(8) as SpanId;
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  do crypto.getRandomValues(data);
  while (data.every((byte) => byte === 0));
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
