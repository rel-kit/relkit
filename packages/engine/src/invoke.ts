import {
  createInvocationCallStack,
  assertInvocationMode,
  currentInvocationScope,
  getDescriptorServiceIdentity,
  normalizeFailure,
  runInInvocationScope,
} from "@relkit/invocation";
import {
  assertSource,
  callHook,
  canonicalTarget,
  calculateDeadline,
  createRecord,
  defaultIdSource,
  defaultRunner,
  linkSignals,
  resolveTarget,
  validateDeclaredError,
  validated,
} from "./invoke-utils.js";
import { runHandler } from "./invoke-runtime.js";
import { completeInvocation } from "./invoke-completion.js";
import { createEngineDispatcher } from "./invocation-dispatcher.js";
import { resolveDirectTarget } from "./direct-target.js";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";
import type { DirectFunctionRequest } from "./dependencies.js";
import type {
  InvocationContext,
  InvocationOutcome,
  InvocationParent,
  InvocationTarget,
  InvocationValidationError,
  InvokeOptions,
} from "./invoke-types.js";
import { InvocationValidationError as ValidationError } from "./invoke-types.js";

export * from "./invoke-types.js";

export async function invoke<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(options: InvokeOptions<Input, Output, Context>): Promise<Output> {
  const activeScope = currentInvocationScope();
  if (options.parent === undefined && activeScope?.parent !== undefined) {
    options = { ...options, parent: activeScope.parent };
  }
  const dispatcher = createEngineDispatcher(
    options,
    (next) => invoke(next),
    (edge) => {
      void callHook(options.hooks?.onObservedEdge, edge);
      void emitObservabilityEvent(options.hooks?.observability, {
        protocol: OBSERVABILITY_HOOK_PROTOCOL,
        version: OBSERVABILITY_HOOK_VERSION,
        type: "edge.observed",
        edge,
      });
    },
  );
  const parentChain = activeScope?.chain ?? createInvocationCallStack();
  const target = canonicalTarget(resolveTarget(options));
  const serviceId = getDescriptorServiceIdentity(target) ?? options.serviceId;
  const source = options.source ?? "direct";
  assertSource(source);
  assertInvocationMode(target, source);
  const now = options.now?.() ?? Date.now();
  const deadlineMs = calculateDeadline(target.timeoutMs, options, options.parent?.deadlineMs, now);
  const idSource = options.idSource ?? defaultIdSource;
  const traceId = options.traceId ?? options.parent?.traceId ?? idSource.next("trace");
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

  const controller = new AbortController();
  const unlink = linkSignals(controller, [options.signal, options.parent?.signal]);
  let lease: { release: () => unknown } | undefined;
  let admitted = false;
  let value: Output | undefined;
  let error: InvocationValidationError | ReturnType<typeof normalizeFailure> | undefined;
  let outcome: InvocationOutcome = "defect";
  try {
    const chain = parentChain.enterDescriptor(target, record.id);
    if (controller.signal.aborted) {
      throw normalizeFailure(controller.signal.reason, { signal: controller.signal });
    }
    const input = await validated(target.input, options.input, "input");
    if (deadlineMs !== undefined && deadlineMs <= now) {
      throw normalizeFailure(new Error("Invocation deadline expired"), {
        signal: controller.signal,
        timedOut: true,
      });
    }
    lease = (await (options.admit ?? options.admission?.acquire ?? (() => undefined))({
      functionId: target.id,
      source,
      ...(options.triggerLimit === undefined ? {} : { triggerLimit: options.triggerLimit }),
      ...(target.concurrency === undefined ? {} : { limit: target.concurrency }),
      ...(deadlineMs === undefined ? {} : { deadlineMs }),
      signal: controller.signal,
    })) as { release: () => unknown } | undefined;
    admitted = true;
    const runner = options.effectRunner ?? options.bridge ?? defaultRunner;
    const childInvoker = (request: DirectFunctionRequest, parent: InvocationParent) =>
      invoke({
        target: resolveDirectTarget<Context>(request, options.registry),
        input: request.input,
        source: "direct",
        parent,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.clients === undefined ? {} : { clients: options.clients }),
        ...(serviceId === undefined ? {} : { serviceId }),
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.admit === undefined ? {} : { admit: options.admit }),
        ...(options.admission === undefined ? {} : { admission: options.admission }),
        ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
        effectRunner: runner,
        idSource,
      });
    const scopeParent: {
      id: string;
      traceId: string;
      correlationId?: string;
      deadlineMs?: number;
      signal: AbortSignal;
      spanId?: string;
      trace?: unknown;
    } = {
      id: record.id,
      traceId,
      ...(record.correlationId === undefined ? {} : { correlationId: record.correlationId }),
      ...(deadlineMs === undefined ? {} : { deadlineMs }),
      signal: controller.signal,
    };
    value = (await runInInvocationScope({ dispatcher, parent: scopeParent, chain }, () =>
      runHandler(
        target,
        input,
        record,
        options,
        controller,
        deadlineMs,
        traceId,
        idSource,
        runner,
        childInvoker,
        (trace) => {
          scopeParent.trace = trace;
          if (trace.context?.spanId !== undefined) scopeParent.spanId = trace.context.spanId;
        },
      ),
    )) as Output;
    value = (await validated(target.output, value, "output")) as Output;
    outcome = "success";
  } catch (cause) {
    error =
      cause instanceof ValidationError && cause.phase === "input"
        ? cause
        : cause instanceof ValidationError
          ? normalizeFailure(cause)
          : normalizeFailure(cause, { signal: controller.signal });
    error = await validateDeclaredError(target.errors, error);
    outcome = error instanceof ValidationError ? "validation-error" : error.outcome;
  } finally {
    await completeInvocation({ record, outcome, error, options, lease, admitted, unlink });
  }
  if (error !== undefined) throw error;
  return value as Output;
}

export { invokeFunction } from "./invoke-function.js";
