import type {
  CapturedInvocationTrace,
  InvocationRunner,
  InvocationBridgeOptions,
  InvocationBridge,
} from "./tracing-bridge.types.js";
export type {
  CapturedInvocationTrace,
  InvocationRunner,
  InvocationBridgeOptions,
  InvocationBridge,
} from "./tracing-bridge.types.js";
import { Effect } from "effect";
import { currentExecutionContext } from "@relkit/invocation";
import { InvocationTrace, withChildSpan, type InvocationTraceOptions } from "./tracing.js";

/** Lazily captures the caller's trace and tracer for re-entry through its runtime.
 * @see createInvocationBridge for the checked native boundary composition example.
 */
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

/**
 * Re-enters captured invocation context in the caller's runtime.
 * @typeParam A - Successful workflow value.
 * @typeParam E - Typed workflow failure.
 * @param effect - Lazy work with dependencies already supplied.
 * @param captured - Trace captured at the public boundary.
 * @param options - Optional child span metadata.
 * @returns The workflow with its original tracer and parent span.
 * @throws TypeError when the captured context has no active invocation span.
 * @see createInvocationBridge for capture, provisioning and runtime ownership.
 */
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
    name: options.name ?? "relkit.context",
    invocationId: context.invocationId,
    ...(context.functionId === undefined ? {} : { functionId: context.functionId }),
    ...(context.serviceId === undefined ? {} : { serviceId: context.serviceId }),
    ...(context.parentInvocationId === undefined
      ? {}
      : { parentInvocationId: context.parentInvocationId }),
    ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    ...(context.source === undefined ? {} : { source: context.source }),
    ...(options.attributes === undefined ? {} : { attributes: options.attributes }),
    ...(options.kind === undefined ? {} : { kind: options.kind }),
    ...(options.input === undefined ? {} : { input: options.input }),
  };
  return Effect.withTracer(
    Effect.withParentSpan(withChildSpan(effect, tracedOptions), captured.parentSpan),
    captured.tracer,
  );
}

/**
 * Creates a Promise adapter over the caller-owned invocation runtime.
 * @param runner - Existing runtime execution boundary.
 * @param captured - Active invocation context captured before crossing the boundary.
 * @returns A bridge that preserves context and cancellation without creating a runtime.
 * @example
 * ```ts
 * import { Effect, Layer, ManagedRuntime } from "effect";
 * import { captureInvocationTrace, createInvocationBridge, withRootSpan } from "@relkit/runtime-effect";
 * const runtime = ManagedRuntime.make(Layer.empty);
 * try {
 *   await runtime.runPromise(withRootSpan(Effect.gen(function* () {
 *     const captured = yield* captureInvocationTrace;
 *     const bridge = createInvocationBridge({
 *       run: (effect, options) => runtime.runPromise(effect, options),
 *     }, captured);
 *     return yield* Effect.promise(() => bridge.run(Effect.succeed("done"), { name: "ctx.cache" }));
 *   }), { name: "invoke", invocationId: "invoke-1" }));
 * } finally { await runtime.dispose(); }
 * ```
 */
export function createInvocationBridge(
  runner: InvocationRunner,
  captured: CapturedInvocationTrace,
): InvocationBridge {
  /** Runs work beneath the active child span or the captured invocation span.
   * @typeParam A - Successful operation value.
   * @typeParam E - Existing typed operation failure.
   * @param effect - Fully provided lazy operation.
   * @param options - Child-span metadata and optional cancellation override.
   * @returns The caller-owned runner's Promise, retaining its value and rejection identity.
   * @remarks The active span wins during nested calls; this adapter creates no runtime.
   */
  const execute = <A, E>(effect: Effect.Effect<A, E, never>, options?: InvocationBridgeOptions) => {
    const signal = options?.signal ?? captured.context?.signal;
    const active = currentExecutionContext();
    const current =
      active?.tracer === undefined
        ? captured
        : {
            ...captured,
            parentSpan: active.span,
            tracer: active.tracer,
          };
    return runner.run(reenterInvocation(effect, current, options), {
      ...(signal === undefined ? {} : { signal }),
    });
  };
  return Object.freeze({
    run: execute,
    runVoid: execute,
  });
}
