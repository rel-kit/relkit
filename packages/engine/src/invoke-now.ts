import {
  createProgressEmitter,
  findNativeSuspension,
  isStreamOutput,
  normalizeFailure,
  runInInvocationScope,
} from "@relkit/invocation";
import { Cause, Effect, Exit } from "effect";
import { enginePromise, engineRunner, runEnginePromise } from "./engine-runtime.js";
import { createInvocationExecution } from "./invocation-execution.js";
import { acquireInvocationLease } from "./invoke-admission.js";
import { createChildInvoker } from "./invoke-child.js";
import { settleInvocation } from "./invoke-finalization.js";
import { createInvocationStream } from "./invoke-now-stream.js";
import type { InvokeNext } from "./invoke-now-types.js";
import { createObservationScope } from "./invoke-observation-scope.js";
import { runHandler } from "./invoke-runtime.js";
import { invocationScopeParent, startInvocation } from "./invoke-start.js";
import type { InvocationContext, InvocationOutcome, InvokeOptions } from "./invoke-types.js";
import { InvocationValidationError as ValidationError } from "./invoke-types.js";
import { linkSignals, validateDeclaredError, validated } from "./invoke-utils.js";

/** Run admitted execution and retain cleanup ownership until completion or stream settlement.
 * @typeParam Input - Validated handler input type.
 * @typeParam Output - Validated handler output type.
 * @typeParam Context - Handler context carrying cancellation authority.
 * @returns A Promise of validated output; stream output owns its deferred cleanup.
 * @param options - Explicit configuration and dependencies for this operation.
 * @param streamLifecycle - Whether output cleanup transfers to stream consumption.
 * @param invokeNext - Recursive engine boundary used by the shared dispatcher.
 * @param onSuspension - Internal observation bridge notified before a continuation is returned.
 */
export async function invokeNow<
  Input = unknown,
  Output = unknown,
  Context extends { readonly signal: AbortSignal } = InvocationContext,
>(
  options: InvokeOptions<Input, Output, Context>,
  streamLifecycle: boolean,
  invokeNext: InvokeNext,
  onSuspension?: () => void,
): Promise<Output> {
  const observations = await createObservationScope(options.hooks);
  let transferred = false;
  if (observations.hooks !== undefined) options = { ...options, hooks: observations.hooks };
  try {
    const started = await startInvocation(options, invokeNext);
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
    return await execution.run(() =>
      runEnginePromise(
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const unlink = linkSignals(controller, [options.signal, options.parent?.signal]);
            let lease: { release: () => unknown } | undefined;
            let admitted = false;
            let value: Output | undefined;
            let error: ValidationError | ReturnType<typeof normalizeFailure> | undefined;
            let outcome: InvocationOutcome = "defect";
            let deferredCompletion = false;
            let suspended = false;
            let suspensionCause: unknown;
            let validationFailure: { readonly cause: unknown } | undefined;
            const progress =
              target.progress === undefined
                ? undefined
                : createProgressEmitter(target.progress, controller.signal, options.progressSink);
            return yield* Effect.gen(function* () {
              const attempted = yield* Effect.exit(
                restore(
                  Effect.gen(function* () {
                    const chain = parentChain.enterDescriptor(target, record.id);
                    if (controller.signal.aborted) {
                      return yield* Effect.fail(
                        normalizeFailure(controller.signal.reason, { signal: controller.signal }),
                      );
                    }
                    const input = options.skipInputValidation
                      ? options.input
                      : yield* enginePromise(() => validated(target.input, options.input, "input"));
                    if (deadlineMs !== undefined && deadlineMs <= now) {
                      return yield* Effect.fail(
                        normalizeFailure(new Error("Invocation deadline expired"), {
                          signal: controller.signal,
                          timedOut: true,
                        }),
                      );
                    }
                    lease =
                      (yield* acquireInvocationLease(
                        options,
                        target,
                        source,
                        controller.signal,
                        deadlineMs,
                      )) ?? undefined;
                    admitted = true;
                    const runner = engineRunner(options.effectRunner ?? options.bridge);
                    const childInvoker = createChildInvoker(
                      options,
                      invokeNext,
                      runner,
                      idSource,
                      serviceId,
                    );
                    const scopeParent = invocationScopeParent(
                      record,
                      controller.signal,
                      deadlineMs,
                    );
                    value = (yield* enginePromise(() =>
                      runInInvocationScope(
                        {
                          dispatcher,
                          parent: scopeParent,
                          chain,
                          ...(started.taskAncestry === undefined
                            ? {}
                            : { taskAncestry: started.taskAncestry }),
                        },
                        () =>
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
                            options.invokeTask,
                            progress?.emitter,
                            (trace) => {
                              scopeParent.trace = trace;
                              if (trace.context?.spanId !== undefined)
                                scopeParent.spanId = trace.context.spanId;
                            },
                          ),
                      ),
                    )) as Output;
                    if (options.skipOutputValidation !== true)
                      value = (yield* enginePromise(() =>
                        validated(target.output, value, "output"),
                      )) as Output;
                    if (streamLifecycle && isStreamOutput(target.output)) {
                      value = createInvocationStream({
                        source: value as AsyncIterable<unknown>,
                        schema: target.output.item,
                        controller,
                        execution,
                        dispatcher,
                        parent: scopeParent,
                        chain,
                        ...(started.taskAncestry === undefined
                          ? {}
                          : { taskAncestry: started.taskAncestry }),
                        progress,
                        record,
                        options,
                        lease,
                        admitted,
                        unlink,
                        closeObservations: observations.close,
                      });
                      deferredCompletion = true;
                      transferred = true;
                    } else {
                      execution.captureOutput(value);
                      outcome = "success";
                    }
                  }),
                ),
              );
              if (Exit.isFailure(attempted)) {
                const cause = Cause.squash(attempted.cause);
                const suspension = findNativeSuspension(cause);
                if (suspension !== undefined) {
                  suspended = true;
                  onSuspension?.();
                  execution.suspend();
                  suspensionCause = suspension.value;
                } else {
                  error =
                    cause instanceof ValidationError && cause.phase === "input"
                      ? cause
                      : cause instanceof ValidationError
                        ? normalizeFailure(cause)
                        : normalizeFailure(cause, { signal: controller.signal });
                  const normalized = error;
                  const validatedError = yield* Effect.exit(
                    enginePromise(() => validateDeclaredError(target.errors, normalized)),
                  );
                  if (Exit.isFailure(validatedError))
                    validationFailure = { cause: Cause.squash(validatedError.cause) };
                  else {
                    error = validatedError.value;
                    outcome = error instanceof ValidationError ? "validation-error" : error.outcome;
                  }
                }
              }
              if (suspended) return yield* Effect.fail(suspensionCause);
              if (validationFailure !== undefined)
                return yield* Effect.fail(validationFailure.cause);
              if (error !== undefined) return yield* Effect.fail(error);
              return value as Output;
            }).pipe(
              Effect.ensuring(
                Effect.suspend(() =>
                  settleInvocation({
                    record,
                    outcome,
                    error,
                    options,
                    lease,
                    admitted,
                    unlink,
                    suspended,
                    deferredCompletion,
                    progress,
                    execution,
                  }),
                ),
              ),
            );
          }),
        ),
      ),
    );
  } finally {
    if (!transferred) await observations.close();
  }
}
