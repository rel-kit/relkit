import type { Effect, Tracer as EffectTracer } from "effect";
import type { InvocationTraceContext, InvocationTraceOptions } from "./tracing.js";

/** Caller trace/tracer snapshot retained across a Promise boundary. */
export interface CapturedInvocationTrace {
  readonly context: InvocationTraceContext | undefined;
  readonly parentSpan: EffectTracer.AnySpan | undefined;
  readonly tracer: EffectTracer.Tracer;
}

/** Existing execution boundary accepting fully supplied Effect workflows. */
export interface InvocationRunner {
  /** Runs supplied work through the existing runtime.
   * @typeParam A - Success value.
   * @typeParam E - Typed workflow failure.
   * @param effect - Lazy workflow with dependencies already supplied.
   * @param options - Optional external cancellation authority.
   * @returns The result or the runtime's failure/interruption rejection.
   */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, never>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<A>;
}

/** Optional child span and cancellation overrides for context re-entry. */
export interface InvocationBridgeOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly kind?: InvocationTraceOptions["kind"];
  readonly input?: unknown;
}

/** Promise compatibility adapter that reuses the caller-owned runtime. */
export interface InvocationBridge {
  /** Runs work under the captured invocation's tracer and active child context.
   * @typeParam A - Success value.
   * @typeParam E - Typed workflow failure.
   * @param effect - Lazy workflow with dependencies already supplied.
   * @param options - Optional child span metadata and cancellation override.
   * @returns The workflow's successful result or failure rejection.
   */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, never>,
    options?: InvocationBridgeOptions,
  ) => Promise<A>;

  /** Runs work whose caller discards its successful result.
   * @typeParam E - Typed workflow failure.
   * @param effect - Lazy workflow with dependencies already supplied.
   * @param options - Optional child span metadata and cancellation override.
   * @returns Completion or failure/interruption rejection.
   */
  readonly runVoid: <E>(
    effect: Effect.Effect<void, E, never>,
    options?: InvocationBridgeOptions,
  ) => Promise<void>;
}
