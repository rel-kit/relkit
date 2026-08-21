import { Effect, Tracer as EffectTracer } from "effect";
import {
  InvocationTrace,
  withChildSpan,
  type InvocationTraceContext,
  type InvocationTraceOptions,
} from "./tracing.js";

export interface CapturedInvocationTrace {
  readonly context: InvocationTraceContext | undefined;
  readonly parentSpan: EffectTracer.AnySpan | undefined;
  readonly tracer: EffectTracer.Tracer;
}

export const captureInvocationTrace: Effect.Effect<CapturedInvocationTrace> = Effect.gen(
  function* () {
    const parentSpan = yield* Effect.option(Effect.currentSpan);
    return {
      context: yield* Effect.service(InvocationTrace),
      parentSpan: parentSpan._tag === "Some" ? parentSpan.value : undefined,
      tracer: yield* Effect.tracer,
    };
  },
);

export interface InvocationRunner {
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, never>,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<A>;
}

export interface InvocationBridgeOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

export interface InvocationBridge {
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, never>,
    options?: InvocationBridgeOptions,
  ) => Promise<A>;
  readonly runVoid: <E>(
    effect: Effect.Effect<void, E, never>,
    options?: InvocationBridgeOptions,
  ) => Promise<void>;
}

export function reenterInvocation<A, E>(
  effect: Effect.Effect<A, E, never>,
  captured: CapturedInvocationTrace,
  options: InvocationBridgeOptions = {},
): Effect.Effect<A, E, never> {
  if (captured.context === undefined || captured.parentSpan === undefined) {
    throw new TypeError("Invocation bridge requires an active invocation span");
  }
  const context = captured.context;
  const tracedOptions: InvocationTraceOptions = {
    name: options.name ?? "zsys.context",
    invocationId: context.invocationId,
    ...(context.functionId === undefined ? {} : { functionId: context.functionId }),
    ...(context.serviceId === undefined ? {} : { serviceId: context.serviceId }),
    ...(context.parentInvocationId === undefined
      ? {}
      : { parentInvocationId: context.parentInvocationId }),
    ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    ...(context.source === undefined ? {} : { source: context.source }),
    ...(options.attributes === undefined ? {} : { attributes: options.attributes }),
  };
  return Effect.withTracer(
    Effect.withParentSpan(withChildSpan(effect, tracedOptions), captured.parentSpan),
    captured.tracer,
  );
}

export function createInvocationBridge(
  runner: InvocationRunner,
  captured: CapturedInvocationTrace,
): InvocationBridge {
  const execute = <A, E>(effect: Effect.Effect<A, E, never>, options?: InvocationBridgeOptions) => {
    const signal = options?.signal ?? captured.context?.signal;
    return runner.run(reenterInvocation(effect, captured, options), {
      ...(signal === undefined ? {} : { signal }),
    });
  };
  return Object.freeze({
    run: execute,
    runVoid: execute,
  });
}
