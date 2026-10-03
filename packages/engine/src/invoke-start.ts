import { createTraceId, isTraceId } from "@relkit/contracts";
import {
  assertInvocationMode,
  createInvocationCallStack,
  currentInvocationScope,
  getDescriptorServiceIdentity,
} from "@relkit/invocation";
import { observeExecution } from "@relkit/runtime-effect";
import { Clock, Effect } from "effect";
import { enginePromise, runEnginePromise } from "./engine-runtime.js";
import { createEngineDispatcher } from "./invocation-dispatcher.js";
import type { InvocationStart, MutableInvocationParent } from "./invoke-start.types.js";
import type { InvocationContext, InvocationRecord, InvokeOptions } from "./invoke-types.js";
import {
  assertSource,
  calculateDeadline,
  callHook,
  canonicalTarget,
  createRecord,
  defaultIdSource,
  resolveTarget,
} from "./invoke-utils.js";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";
export type { InvocationStart, MutableInvocationParent } from "./invoke-start.types.js";

/** Build child-dispatch parent metadata from an invocation record.
 * @returns Parent metadata later enriched with the active shared trace.
 * @param record - Immutable invocation identity and start metadata.
 * @param signal - Caller cancellation signal.
 * @param deadlineMs - Optional absolute deadline in milliseconds.
 */
export function invocationScopeParent(
  record: InvocationRecord,
  signal: AbortSignal,
  deadlineMs: number | undefined,
): MutableInvocationParent {
  return {
    id: record.id,
    traceId: record.traceId,
    ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
    ...(deadlineMs === undefined ? {} : { deadlineMs }),
    signal,
  };
}

/** Resolve invocation identity and publish start hooks before admission.
 * @returns A lazy Effect yielding target, identity and shared dispatcher state after advisory start hooks.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @param initialOptions - Caller configuration before shared parent metadata is inherited.
 * @param invokeNext - Recursive engine boundary used by the shared dispatcher.
 */
export const startInvocationEffect = Effect.fn("Engine.startInvocation")(
  function* <
    Input = unknown,
    Output = unknown,
    Context extends { readonly signal: AbortSignal } = InvocationContext,
  >(
    initialOptions: InvokeOptions<Input, Output, Context>,
    invokeNext: (next: InvokeOptions<Input, Output, Context>) => Promise<unknown>,
  ) {
    const activeScope = currentInvocationScope();
    const options =
      initialOptions.parent === undefined && activeScope?.parent !== undefined
        ? { ...initialOptions, parent: activeScope.parent }
        : initialOptions;
    const dispatcher = createEngineDispatcher(options, invokeNext, (edge) => {
      void callHook(options.hooks?.onObservedEdge, edge);
      void emitObservabilityEvent(options.hooks?.observability, {
        protocol: OBSERVABILITY_HOOK_PROTOCOL,
        version: OBSERVABILITY_HOOK_VERSION,
        type: "edge.observed",
        edge,
      });
    });
    const parentChain = activeScope?.chain ?? createInvocationCallStack();
    const target = canonicalTarget(resolveTarget(options));
    const serviceId = getDescriptorServiceIdentity(target) ?? options.serviceId;
    const source = options.source ?? "direct";
    assertSource(source);
    assertInvocationMode(target, source);
    const now = options.now?.() ?? (yield* Clock.currentTimeMillis);
    const deadlineMs = calculateDeadline(
      target.timeoutMs,
      options,
      options.parent?.deadlineMs,
      now,
    );
    const idSource = options.idSource ?? defaultIdSource;
    const candidateTraceId = options.traceId ?? options.parent?.traceId ?? idSource.next("trace");
    const traceId = isTraceId(candidateTraceId) ? candidateTraceId : createTraceId();
    const record = createRecord(
      target.id,
      source,
      options,
      traceId,
      deadlineMs,
      now,
      idSource,
      serviceId,
    );
    yield* enginePromise(() => Promise.resolve(callHook(options.hooks?.onInvocationStart, record)));
    yield* enginePromise(() =>
      Promise.resolve(
        emitObservabilityEvent(options.hooks?.observability, {
          protocol: OBSERVABILITY_HOOK_PROTOCOL,
          version: OBSERVABILITY_HOOK_VERSION,
          type: "invocation.started",
          record,
        }),
      ),
    );
    const taskAncestry = options.taskAncestry ?? activeScope?.taskAncestry;
    return {
      options,
      dispatcher,
      parentChain,
      target,
      serviceId,
      source,
      now,
      deadlineMs,
      idSource,
      traceId,
      record,
      ...(taskAncestry === undefined ? {} : { taskAncestry }),
    };
  },
  (effect) => observeExecution("engine", "startInvocation", effect),
);

/** Resolve invocation identity and publish start hooks before admission.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A Promise of resolved identity, target and shared dispatcher state.
 * @param initialOptions - Caller configuration before shared parent metadata is inherited.
 * @param invokeNext - Recursive engine boundary used by the shared dispatcher.
 */
export async function startInvocation<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(
  initialOptions: InvokeOptions<Input, Output, Context>,
  invokeNext: (next: InvokeOptions<Input, Output, Context>) => Promise<unknown>,
): Promise<InvocationStart<Input, Output, Context>> {
  return runEnginePromise(
    startInvocationEffect<Input, Output, Context>(initialOptions, invokeNext),
  );
}
