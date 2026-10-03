import { normalizeFailure, type InvocationRunner } from "@relkit/invocation";
import {
  captureInvocationTrace,
  createInvocationBridge,
  createPublicClockEffect,
  type CapturedInvocationTrace,
} from "@relkit/runtime-effect";
import { Effect } from "effect";
import { createContext } from "./context.js";
import type { DirectFunctionInvoker, DirectTaskInvoker } from "./dependencies.js";
import { createDependencyBridge } from "./dependency-bridge.js";
import { runConfiguredLifecycle } from "./invoke-lifecycle.js";
import { runTracedInvocation } from "./invoke-runtime-tracing.js";
import type { DirectChildInvoker } from "./invoke-runtime.types.js";
import { createInvocationSpanOptions } from "./invoke-tracing.js";
import type {
  InvocationContext,
  InvocationIdSource,
  InvocationRecord,
  InvocationTarget,
  InvokeOptions,
} from "./invoke-types.js";
import { callHook, makeContext } from "./invoke-utils.js";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";

/** Build guarded context and execute the shared lifecycle under invocation tracing.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A Promise of lifecycle output before the outer invocation owns final completion.
 * @param target - Declared target whose schema and metadata govern execution.
 * @param input - Untrusted input validated before handler execution.
 * @param record - Immutable invocation identity and start metadata.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param controller - Invocation-owned abort controller.
 * @param deadlineMs - Optional absolute deadline in milliseconds.
 * @param traceId - Current shared trace identity.
 * @param idSource - Shared trace, span and invocation identity allocator.
 * @param runner - Configured Effect runtime at the native execution boundary.
 * @param childInvoker - Direct child callback supplied by shared invocation dispatch.
 * @param taskInvoker - Native durable task submission callback.
 * @param progress - Optional validated progress emitter.
 * @param onTrace - Callback retaining the shared trace context for child calls.
 */
export async function runHandler<
  Input,
  Output,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(
  target: InvocationTarget<Input, Output, Context>,
  input: unknown,
  record: InvocationRecord,
  options: InvokeOptions<Input, Output, Context>,
  controller: AbortController,
  deadlineMs: number | undefined,
  traceId: string,
  idSource: InvocationIdSource,
  runner: InvocationRunner,
  childInvoker: DirectChildInvoker | undefined,
  taskInvoker: DirectTaskInvoker | undefined,
  progress: import("@relkit/invocation").ProgressEmitter | undefined,
  onTrace?: (trace: CapturedInvocationTrace) => void,
): Promise<unknown> {
  const program = Effect.gen(function* () {
    const signalRef = { current: controller.signal };
    const time = yield* createPublicClockEffect(runner, controller.signal);
    const trace = yield* captureInvocationTrace;
    onTrace?.(trace);
    const bridge = createDependencyBridge(createInvocationBridge(runner, trace), controller.signal);
    const invokeFunction: DirectFunctionInvoker | undefined =
      childInvoker === undefined
        ? undefined
        : (request) =>
            childInvoker(request, {
              id: record.id,
              traceId,
              ...(trace.context?.spanId === undefined ? {} : { spanId: trace.context.spanId }),
              ...(record.correlationId === undefined
                ? {}
                : { correlationId: record.correlationId }),
              ...(deadlineMs === undefined ? {} : { deadlineMs }),
              signal: request.signal ?? signalRef.current,
              trace,
            });
    const invokeTask: DirectTaskInvoker | undefined = taskInvoker;
    const context = yield* Effect.tryPromise({
      try: async () => {
        const base = await makeContext<Context>(
          options.hooks?.context,
          record,
          controller.signal,
          options.env ?? {},
          time,
        );
        return createContext(base, {
          ownerId: target.id,
          ...(target.dependencies === undefined ? {} : { dependencies: target.dependencies }),
          ...(target.publications === undefined ? {} : { publications: target.publications }),
          ...(options.clients === undefined ? {} : { clients: options.clients }),
          bridge,
          signal: () => signalRef.current,
          ...(deadlineMs === undefined ? {} : { deadline: () => deadlineMs }),
          correlationId: () => record.correlationId,
          causationInvocationId: () => record.id,
          traceId: () => traceId,
          now: () => time.now(),
          ...(invokeFunction === undefined ? {} : { invokeFunction }),
          ...(invokeTask === undefined ? {} : { invokeTask }),
          ...(options.hooks?.onDeclaredEdge === undefined &&
          options.hooks?.observability === undefined
            ? {}
            : {
                onDeclaredEdge: (edge: import("@relkit/graph").GraphEdge) => {
                  void callHook(options.hooks?.onDeclaredEdge, edge);
                  void emitObservabilityEvent(options.hooks?.observability, {
                    protocol: OBSERVABILITY_HOOK_PROTOCOL,
                    version: OBSERVABILITY_HOOK_VERSION,
                    type: "edge.declared",
                    edge,
                  });
                },
              }),
          ...(options.hooks?.onObservedEdge === undefined &&
          options.hooks?.observability === undefined
            ? {}
            : {
                onObservedEdge: (edge: import("@relkit/graph").ObservedEdge) => {
                  void callHook(options.hooks?.onObservedEdge, edge);
                  void emitObservabilityEvent(options.hooks?.observability, {
                    protocol: OBSERVABILITY_HOOK_PROTOCOL,
                    version: OBSERVABILITY_HOOK_VERSION,
                    type: "edge.observed",
                    edge,
                  });
                },
              }),
          ...(options.hooks?.onOperation === undefined
            ? {}
            : { onOperation: options.hooks.onOperation }),
          ...(options.trigger === undefined ? {} : { trigger: options.trigger }),
          ...(progress === undefined ? {} : { progress }),
        });
      },
      catch: (cause) => normalizeFailure(cause, { signal: controller.signal }),
    });
    const lifecycle = runConfiguredLifecycle({
      target: target as InvocationTarget<unknown, unknown, Context>,
      input,
      context,
      ...(options.toolHooks === undefined ? {} : { toolHooks: options.toolHooks }),
      ...(deadlineMs === undefined ? {} : { deadline: deadlineMs }),
      onSignal: (signal) => {
        signalRef.current = signal;
      },
      ...(options.isSuspension === undefined ? {} : { isSuspension: options.isSuspension }),
      ...(options.skipInputValidation === undefined
        ? {}
        : { skipInputValidation: options.skipInputValidation }),
      ...(options.taskLifecycle === undefined ? {} : { taskLifecycle: options.taskLifecycle }),
    }) as Effect.Effect<unknown, import("@relkit/invocation").InvocationFailure, never>;
    return yield* lifecycle;
  });
  return runTracedInvocation({
    program,
    runner,
    spanOptions: createInvocationSpanOptions(target, record, options, controller),
    target,
    record,
    options,
    controller,
    traceId,
    idSource,
  });
}
