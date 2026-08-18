import { Context, Effect, Option, Tracer as EffectTracer } from "effect";
import { IdSource } from "./services.js";
import { createZsysTracer, type SpanLifecycleObserver } from "./tracing-span.js";

export { createZsysTracer } from "./tracing-span.js";
export type { SpanLifecycle, SpanLifecycleObserver } from "./tracing-span.js";
export * from "./tracing-bridge.js";

export interface InvocationTraceOptions {
  readonly name: string;
  readonly invocationId: string;
  readonly parentInvocationId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly signal?: AbortSignal;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly kind?: EffectTracer.SpanKind;
  readonly observer?: SpanLifecycleObserver;
}

export interface InvocationTraceContext {
  readonly invocationId: string;
  readonly parentInvocationId?: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly signal?: AbortSignal;
}

export const InvocationTrace = Context.Reference<InvocationTraceContext | undefined>(
  "zsys/runtime/InvocationTrace",
  { defaultValue: () => undefined },
);

function spanAttributes(
  options: Pick<
    InvocationTraceOptions,
    "invocationId" | "parentInvocationId" | "correlationId" | "source" | "attributes"
  >,
): Record<string, unknown> {
  return {
    ...(options.attributes ?? {}),
    "zsys.invocation.id": options.invocationId,
    ...(options.parentInvocationId === undefined
      ? {}
      : { "zsys.invocation.parent_id": options.parentInvocationId }),
    ...(options.correlationId === undefined
      ? {}
      : { "zsys.correlation.id": options.correlationId }),
    ...(options.source === undefined ? {} : { "zsys.invocation.source": options.source }),
  };
}

function contextFromSpan(
  span: EffectTracer.Span,
  options: InvocationTraceOptions,
): InvocationTraceContext {
  const parentSpan = Option.getOrUndefined(span.parent);
  return Object.freeze({
    invocationId: options.invocationId,
    ...(options.parentInvocationId === undefined
      ? {}
      : { parentInvocationId: options.parentInvocationId }),
    traceId: span.traceId,
    spanId: span.spanId,
    ...(parentSpan === undefined ? {} : { parentSpanId: parentSpan.spanId }),
    ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}

export function withRootSpan<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: InvocationTraceOptions,
): Effect.Effect<A, E, Exclude<R, EffectTracer.ParentSpan>> {
  const traced = Effect.withSpan(
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan.pipe(Effect.orDie);
      return yield* Effect.provideService(effect, InvocationTrace, contextFromSpan(span, options));
    }),
    options.name,
    {
      root: true,
      kind: options.kind ?? "internal",
      attributes: spanAttributes(options),
    },
  );
  return Effect.gen(function* () {
    const ids = yield* Effect.serviceOption(IdSource);
    if (Option.isSome(ids)) {
      return yield* Effect.withTracer(traced, createZsysTracer(ids.value, options.observer));
    }
    return yield* traced;
  });
}

function childOptions(
  options: InvocationTraceOptions,
  parent: InvocationTraceContext | undefined,
): InvocationTraceOptions {
  const parentInvocationId =
    options.parentInvocationId ??
    (parent !== undefined && options.invocationId !== parent.invocationId
      ? parent.invocationId
      : undefined);
  return {
    ...options,
    ...(parentInvocationId === undefined ? {} : { parentInvocationId }),
    ...(options.correlationId !== undefined
      ? {}
      : parent?.correlationId === undefined
        ? {}
        : { correlationId: parent.correlationId }),
    ...(options.source !== undefined
      ? {}
      : parent?.source === undefined
        ? {}
        : { source: parent.source }),
  };
}

export function withChildSpan<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: InvocationTraceOptions,
): Effect.Effect<A, E, Exclude<R, EffectTracer.ParentSpan>> {
  return Effect.gen(function* () {
    const parent = yield* Effect.service(InvocationTrace);
    const next = childOptions(options, parent);
    return yield* Effect.withSpan(
      Effect.gen(function* () {
        const span = yield* Effect.currentSpan.pipe(Effect.orDie);
        return yield* Effect.provideService(effect, InvocationTrace, contextFromSpan(span, next));
      }),
      next.name,
      { kind: next.kind ?? "internal", attributes: spanAttributes(next) },
    );
  });
}
