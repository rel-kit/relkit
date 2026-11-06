import type { Tracer as EffectTracer } from "effect";
import type { SpanLifecycleObserver } from "./tracing-span.js";

/** Explicit invocation span metadata with opt-in input capture. */
export interface InvocationTraceOptions {
  readonly name: string;
  readonly invocationId: string;
  readonly functionId?: string;
  readonly serviceId?: string;
  readonly parentInvocationId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly signal?: AbortSignal;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly kind?: EffectTracer.SpanKind;
  readonly observer?: SpanLifecycleObserver;
  readonly input?: unknown;
}

/** Immutable correlation context inherited by child invocation spans. */
export interface InvocationTraceContext {
  readonly invocationId: string;
  readonly functionId?: string;
  readonly serviceId?: string;
  readonly parentInvocationId?: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly signal?: AbortSignal;
}
