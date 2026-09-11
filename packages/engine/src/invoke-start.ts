import {
  assertInvocationMode,
  createInvocationCallStack,
  currentInvocationScope,
  getDescriptorServiceIdentity,
  type InvocationCallStack,
  type InvocationDispatcher,
} from "@relkit/invocation";
import { createTraceId, isTraceId } from "@relkit/contracts";
import { createEngineDispatcher } from "./invocation-dispatcher.js";
import {
  assertSource,
  callHook,
  calculateDeadline,
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
import type {
  InvocationContext,
  InvocationIdSource,
  InvocationParent,
  InvocationRecord,
  InvocationSource,
  InvocationTarget,
  InvokeOptions,
} from "./invoke-types.js";

export interface InvocationStart<Input, Output, Context extends { readonly signal: AbortSignal }> {
  readonly options: InvokeOptions<Input, Output, Context>;
  readonly dispatcher: InvocationDispatcher;
  readonly parentChain: InvocationCallStack;
  readonly target: InvocationTarget<Input, Output, Context>;
  readonly serviceId: string | undefined;
  readonly source: InvocationSource;
  readonly now: number;
  readonly deadlineMs: number | undefined;
  readonly idSource: InvocationIdSource;
  readonly traceId: string;
  readonly record: InvocationRecord;
}

export interface MutableInvocationParent extends InvocationParent {
  spanId?: string;
  trace?: unknown;
}

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

export async function startInvocation<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(
  initialOptions: InvokeOptions<Input, Output, Context>,
  invokeNext: (next: InvokeOptions<Input, Output, Context>) => Promise<unknown>,
): Promise<InvocationStart<Input, Output, Context>> {
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
  const now = options.now?.() ?? Date.now();
  const deadlineMs = calculateDeadline(target.timeoutMs, options, options.parent?.deadlineMs, now);
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
  await callHook(options.hooks?.onInvocationStart, record);
  await emitObservabilityEvent(options.hooks?.observability, {
    protocol: OBSERVABILITY_HOOK_PROTOCOL,
    version: OBSERVABILITY_HOOK_VERSION,
    type: "invocation.started",
    record,
  });
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
  };
}
