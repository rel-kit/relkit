import type { SpanContext } from "@relkit/contracts";
import type { Tracer } from "effect";
import type { RelkitSpan } from "./tracing-span.js";
import type { SpanRuntime } from "./span-runtime.js";

export interface ExecutionContext {
  readonly span: Tracer.AnySpan;
  readonly runtime: SpanRuntime;
  readonly tracer?: Tracer.Tracer;
  readonly requestId?: string;
  readonly originRequestId?: string;
  readonly invocationId?: string;
  readonly parentInvocationId?: string;
  readonly functionId?: string;
  readonly serviceId?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly correlationId?: string;
}

export function spanContext(span: RelkitSpan): SpanContext {
  return Object.freeze({
    traceId: span.traceId,
    spanId: span.spanId,
    traceFlags: span.sampled ? 1 : 0,
    ...(span.traceState === undefined ? {} : { traceState: span.traceState }),
  });
}
