import { Effect } from "effect";
import type { MaybePromise, ProtocolId } from "@zsys/contracts";
import { normalizeFailure, type InvocationRunner } from "@zsys/invocation";
import {
  createPublicClockEffect,
  createInvocationBridge,
  captureInvocationTrace,
  withChildSpan,
  withRootSpan,
  createZsysTracer,
  IdSource,
  InvocationTrace,
  type CapturedInvocationTrace,
} from "@zsys/runtime-effect";
import type { DirectFunctionInvoker, DirectFunctionRequest } from "./dependencies.js";
import { createContext } from "./context.js";
import { callHook, makeContext } from "./invoke-utils.js";
import { createDependencyBridge } from "./dependency-bridge.js";
import { createInvocationSpanOptions } from "./invoke-tracing.js";
import { runConfiguredLifecycle } from "./invoke-lifecycle.js";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";
import type {
  InvocationContext,
  InvocationIdSource,
  InvocationRecord,
  InvocationTarget,
  InvocationParent,
  InvokeOptions,
} from "./invoke-types.js";
type DirectChildInvoker = (
  request: DirectFunctionRequest,
  parent: InvocationParent,
) => MaybePromise<unknown>;
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
  onTrace?: (trace: CapturedInvocationTrace) => void,
): Promise<unknown> {
  const spanSource: InvocationIdSource = {
    next: (kind) => (kind === "trace" ? (traceId as ProtocolId) : idSource.next(kind)),
  };
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
          ...(options.clients === undefined ? {} : { clients: options.clients }),
          bridge,
          signal: () => signalRef.current,
          ...(deadlineMs === undefined ? {} : { deadline: () => deadlineMs }),
          correlationId: () => record.correlationId,
          causationInvocationId: () => record.id,
          traceId: () => traceId,
          now: () => time.now(),
          ...(invokeFunction === undefined ? {} : { invokeFunction }),
          ...(options.hooks?.onDeclaredEdge === undefined &&
          options.hooks?.observability === undefined
            ? {}
            : {
                onDeclaredEdge: (edge: import("@zsys/graph").GraphEdge) => {
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
                onObservedEdge: (edge: import("@zsys/graph").ObservedEdge) => {
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
        });
      },
      catch: (cause) => normalizeFailure(cause, { signal: controller.signal }),
    });
    return yield* runConfiguredLifecycle({
      target: target as InvocationTarget<unknown, unknown, Context>,
      input,
      context,
      ...(options.toolHooks === undefined ? {} : { toolHooks: options.toolHooks }),
      ...(options.servicePolicies === undefined
        ? {}
        : { servicePolicies: options.servicePolicies }),
      ...(deadlineMs === undefined ? {} : { deadline: deadlineMs }),
      runner,
      signal: controller.signal,
      onSignal: (signal) => {
        signalRef.current = signal;
      },
    });
  });
  const spanOptions = createInvocationSpanOptions(target, record, options, controller);
  const capturedParent = options.parent?.trace as CapturedInvocationTrace | undefined;
  const childTracerIds: import("@zsys/runtime-effect").IdSourceService = {
    next: (kind) => (kind === "trace" ? (traceId as ProtocolId) : idSource.next("span")),
  };
  const traced =
    capturedParent?.context === undefined || capturedParent.parentSpan === undefined
      ? withRootSpan(program, spanOptions)
      : Effect.withTracer(
          Effect.withParentSpan(
            Effect.provideService(
              withChildSpan(program, spanOptions),
              InvocationTrace,
              capturedParent.context,
            ),
            capturedParent.parentSpan,
          ),
          createZsysTracer(childTracerIds, spanOptions.observer),
        );
  return runner.run(Effect.provideService(traced, IdSource, spanSource), {
    signal: controller.signal,
  });
}
