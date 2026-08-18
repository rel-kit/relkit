import { normalizeFailure, toPublicEnvelope } from "@zsys/runtime-effect";
import {
  assertSource,
  callHook,
  calculateDeadline,
  completeRecord,
  createRecord,
  defaultIdSource,
  defaultRunner,
  linkSignals,
  resolveTarget,
  validateDeclaredError,
  validated,
} from "./invoke-utils.js";
import { runHandler } from "./invoke-runtime.js";
import { resolveDirectTarget } from "./direct-target.js";
import {
  emitObservabilityEvent,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
} from "./observability.js";
import type { DirectFunctionRequest } from "./dependencies.js";
import type {
  InvocationCompletion,
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
  const target = resolveTarget(options);
  const source = options.source ?? "direct";
  assertSource(source);
  const now = options.now?.() ?? Date.now();
  const deadlineMs = calculateDeadline(target.timeoutMs, options, options.parent?.deadlineMs, now);
  const idSource = options.idSource ?? defaultIdSource;
  const traceId = options.traceId ?? options.parent?.traceId ?? idSource.next("trace");
  const record = createRecord(target.id, source, options, traceId, deadlineMs, now, idSource);
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
        ...(options.now === undefined ? {} : { now: options.now }),
        ...(options.admit === undefined ? {} : { admit: options.admit }),
        ...(options.admission === undefined ? {} : { admission: options.admission }),
        ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
        effectRunner: runner,
        idSource,
      });
    value = (await runHandler(
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
    const completed = completeRecord(record, outcome, options.now?.() ?? Date.now());
    const completion: InvocationCompletion = Object.freeze({
      record: completed,
      outcome,
      ...(error === undefined ? {} : { error, publicError: toPublicEnvelope(error) }),
    });
    try {
      await callHook(options.hooks?.onCompletion, completion);
      await emitObservabilityEvent(options.hooks?.observability, {
        protocol: OBSERVABILITY_HOOK_PROTOCOL,
        version: OBSERVABILITY_HOOK_VERSION,
        type: "invocation.completed",
        completion,
      });
    } finally {
      try {
        await lease?.release();
      } finally {
        await callHook(options.hooks?.onRelease, { record: completed, admitted });
        await emitObservabilityEvent(options.hooks?.observability, {
          protocol: OBSERVABILITY_HOOK_PROTOCOL,
          version: OBSERVABILITY_HOOK_VERSION,
          type: "invocation.released",
          release: { record: completed, admitted },
        });
        unlink();
      }
    }
  }
  if (error !== undefined) throw error;
  return value as Output;
}

export { invokeFunction } from "./invoke-function.js";
