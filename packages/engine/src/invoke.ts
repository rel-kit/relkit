import {
  normalizeFailure,
  runInInvocationScope,
  isStreamOutput,
  lazySingleConsumerStream,
  managedValidatedStream,
  createProgressEmitter,
} from "@relkit/invocation";
import {
  canonicalTarget,
  defaultRunner,
  linkSignals,
  resolveTarget,
  validateDeclaredError,
  validated,
} from "./invoke-utils.js";
import { runHandler } from "./invoke-runtime.js";
import { completeInvocation } from "./invoke-completion.js";
import { resolveDirectTarget } from "./direct-target.js";
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
import { createInvocationExecution } from "./invocation-execution.js";
import { invocationScopeParent, startInvocation } from "./invoke-start.js";

export * from "./invoke-types.js";
export async function invoke<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(options: InvokeOptions<Input, Output, Context>): Promise<Output> {
  const target = canonicalTarget(resolveTarget(options));
  if (isStreamOutput(target.output)) {
    return Promise.resolve(
      lazySingleConsumerStream(
        () => invokeNow({ ...options, target }, true) as Promise<AsyncIterable<unknown>>,
      ) as Output,
    );
  }
  return invokeNow(options, false);
}

async function invokeNow<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(options: InvokeOptions<Input, Output, Context>, streamLifecycle: boolean): Promise<Output> {
  const started = await startInvocation(options, (next) => invoke(next));
  ({ options } = started);
  const {
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
  } = started;

  const controller = new AbortController();
  const execution = createInvocationExecution(target, record, options, controller, idSource);
  execution.captureInput(options.input);
  return execution.run(async () => {
    const unlink = linkSignals(controller, [options.signal, options.parent?.signal]);
    let lease: { release: () => unknown } | undefined;
    let admitted = false;
    let value: Output | undefined;
    let error: InvocationValidationError | ReturnType<typeof normalizeFailure> | undefined;
    let outcome: InvocationOutcome = "defect";
    let deferredCompletion = false;
    const progress =
      target.progress === undefined
        ? undefined
        : createProgressEmitter(target.progress, controller.signal, options.progressSink);
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
      const scopeParent = invocationScopeParent(record, controller.signal, deadlineMs);
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
          progress?.emitter,
          (trace) => {
            scopeParent.trace = trace;
            if (trace.context?.spanId !== undefined) scopeParent.spanId = trace.context.spanId;
          },
        ),
      )) as Output;
      value = (await validated(target.output, value, "output")) as Output;
      if (streamLifecycle && isStreamOutput(target.output)) {
        const source = value as AsyncIterable<unknown>;
        deferredCompletion = true;
        value = managedValidatedStream({
          source,
          schema: target.output.item,
          maxItemBytes: 1024 * 1024,
          idleMs: 45_000,
          abort: (reason) => controller.abort(reason),
          run: (work) =>
            execution.run(() =>
              runInInvocationScope({ dispatcher, parent: scopeParent, chain }, work),
            ),
          settle: async (streamCause) => {
            progress?.settle();
            const streamError =
              streamCause === undefined
                ? undefined
                : normalizeFailure(streamCause, { signal: controller.signal });
            const streamOutcome: InvocationOutcome = streamError?.outcome ?? "success";
            execution.complete(streamOutcome, streamError);
            await completeInvocation({
              record,
              outcome: streamOutcome,
              error: streamError,
              options,
              lease,
              admitted,
              unlink,
            });
          },
        }) as Output;
      } else {
        execution.captureOutput(value);
        outcome = "success";
      }
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
      if (!deferredCompletion) {
        progress?.settle();
        execution.complete(outcome, error);
        await completeInvocation({ record, outcome, error, options, lease, admitted, unlink });
      }
    }
    if (error !== undefined) throw error;
    return value as Output;
  });
}
export { invokeFunction } from "./invoke-function.js";
