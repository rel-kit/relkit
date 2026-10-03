import type { InvocationTraceOptions, InvocationTraceContext } from "./tracing.types.js";
export type { InvocationTraceOptions, InvocationTraceContext } from "./tracing.types.js";
import { Context, Effect, Option, Tracer as EffectTracer } from "effect";
import { RelkitSpan } from "@relkit/invocation";
import { IdSource } from "./services.js";
import { createRelkitTracer, type SpanLifecycleObserver } from "./tracing-span.js";

export { createRelkitTracer } from "./tracing-span.js";
export type { SpanLifecycle, SpanLifecycleObserver } from "./tracing-span.js";
export * from "./tracing-bridge.js";

/** Ambient invocation correlation; children inherit it without a separate resource owner. */
export const InvocationTrace = Context.Reference<InvocationTraceContext | undefined>(
  "relkit/runtime/InvocationTrace",
  { defaultValue: () => undefined },
);

/**
 * Projects invocation identifiers into span attributes.
 * @param options - Invocation metadata and explicit safe attributes.
 * @returns Attributes using the established RELKIT keys.
 */
function spanAttributes(
  options: Pick<
    InvocationTraceOptions,
    | "invocationId"
    | "functionId"
    | "serviceId"
    | "parentInvocationId"
    | "correlationId"
    | "source"
    | "attributes"
  >,
): Record<string, unknown> {
  return {
    ...(options.attributes ?? {}),
    "relkit.invocation.id": options.invocationId,
    ...(options.functionId === undefined ? {} : { "relkit.function.id": options.functionId }),
    ...(options.serviceId === undefined ? {} : { "relkit.service.id": options.serviceId }),
    ...(options.parentInvocationId === undefined
      ? {}
      : { "relkit.invocation.parent_id": options.parentInvocationId }),
    ...(options.correlationId === undefined
      ? {}
      : { "relkit.correlation.id": options.correlationId }),
    ...(options.source === undefined ? {} : { "relkit.invocation.source": options.source }),
  };
}

/**
 * Captures invocation context from the newly created span.
 * @param span - Active Effect span.
 * @param options - Invocation metadata.
 * @returns Frozen invocation context with trace and parent identifiers.
 */
function contextFromSpan(
  span: EffectTracer.Span,
  options: InvocationTraceOptions,
): InvocationTraceContext {
  const parentSpan = Option.getOrUndefined(span.parent);
  return Object.freeze({
    invocationId: options.invocationId,
    ...(options.functionId === undefined ? {} : { functionId: options.functionId }),
    ...(options.serviceId === undefined ? {} : { serviceId: options.serviceId }),
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

/**
 * Runs an invocation in a correlated root span.
 * @typeParam A - Successful workflow value.
 * @typeParam E - Typed workflow failure.
 * @typeParam R - Workflow services where applicable.
 * @param effect - Lazy invocation work.
 * @param options - Root span and invocation metadata.
 * @returns Work preserving values, failures and interruption within the span.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { withRootSpan } from "@relkit/runtime-effect";
 * const traced = withRootSpan(Effect.succeed("done"), {
 *   name: "example.invoke", invocationId: "invocation-1", source: "direct" });
 * const result = await Effect.runPromise(traced);
 * ```
 */
export function withRootSpan<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: InvocationTraceOptions,
): Effect.Effect<A, E, Exclude<R, EffectTracer.ParentSpan>> {
  const traced = Effect.withSpan(
    Effect.gen(function* () {
      const span = yield* Effect.currentSpan.pipe(Effect.orDie);
      if (span instanceof RelkitSpan && "input" in options) span.capture("input", options.input);
      const value = yield* Effect.provideService(
        effect,
        InvocationTrace,
        contextFromSpan(span, options),
      );
      if (span instanceof RelkitSpan) span.capture("output", value);
      return value;
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
      return yield* Effect.withTracer(traced, createRelkitTracer(ids.value, options.observer));
    }
    return yield* traced;
  });
}

/**
 * Inherits parent metadata while respecting explicit child fields.
 * @param options - Explicit child metadata.
 * @param parent - Optional parent invocation context.
 * @returns Resolved child metadata without replacing explicit fields.
 */
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
    ...(options.functionId !== undefined
      ? {}
      : parent?.functionId === undefined
        ? {}
        : { functionId: parent.functionId }),
    ...(options.serviceId !== undefined
      ? {}
      : parent?.serviceId === undefined
        ? {}
        : { serviceId: parent.serviceId }),
    ...(options.source !== undefined
      ? {}
      : parent?.source === undefined
        ? {}
        : { source: parent.source }),
  };
}

/**
 * Runs child work with inherited invocation correlation.
 * @typeParam A - Successful workflow value.
 * @typeParam E - Typed workflow failure.
 * @typeParam R - Workflow services where applicable.
 * @param effect - Lazy child workflow.
 * @param options - Explicit child span metadata.
 * @returns Work preserving its original value and failure channels.
 * @see withRootSpan for root provisioning; children retain its correlation context.
 */
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
        if (span instanceof RelkitSpan && "input" in next) span.capture("input", next.input);
        const value = yield* Effect.provideService(
          effect,
          InvocationTrace,
          contextFromSpan(span, next),
        );
        if (span instanceof RelkitSpan) span.capture("output", value);
        return value;
      }),
      next.name,
      { kind: next.kind ?? "internal", attributes: spanAttributes(next) },
    );
  });
}
