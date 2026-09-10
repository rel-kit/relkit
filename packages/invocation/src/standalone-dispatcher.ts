import {
  assertSource,
  assertInvocationMode,
  callHook,
  defaultIdSource,
  defaultRunner,
  validateDeclaredError,
  validated,
} from "./validation.js";
import { createTraceId, isTraceId } from "@relkit/contracts";
import { InvocationValidationError } from "./contracts.js";
import { linkSignals } from "./context.js";
import { normalizeFailure, type InvocationFailure } from "./failure.js";
import { makeStandaloneContext, createLocalClock } from "./dispatcher-context.js";
import { currentInvocationScope, runInInvocationScope } from "./dispatcher-scope.js";
import { createInvocationCallStack, type InvocationCallStack } from "./recursion.js";
import { resolveDescriptorIdentity } from "./identity.js";
import type {
  InvocationDispatchRequest,
  InvocationDispatcher,
  InvocationDispatchOptions,
  StandaloneDispatcherOptions,
} from "./dispatcher-types.js";
import {
  calculateStandaloneDeadline,
  createStandaloneRecord,
  standaloneParent,
} from "./standalone-utils.js";
import { runStandaloneLifecycle } from "./standalone-lifecycle.js";
import {
  isStreamOutput,
  lazySingleConsumerStream,
  managedValidatedStream,
} from "./stream-runtime.js";
import { createProgressEmitter } from "./progress.js";
import { createStandaloneFinisher } from "./standalone-completion.js";

export function createStandaloneDispatcher(
  baseOptions: StandaloneDispatcherOptions = {},
): InvocationDispatcher {
  let dispatcher!: InvocationDispatcher;
  dispatcher = Object.freeze({
    dispatch: <Input, Output, Context extends { readonly signal: AbortSignal }>(
      request: InvocationDispatchRequest<Input, Output, Context>,
    ) => {
      const options = { ...baseOptions, ...request.options } as InvocationDispatchOptions<Context>;
      if (isStreamOutput(request.target.output)) {
        return Promise.resolve(
          lazySingleConsumerStream(
            () =>
              invokeStandalone(request, options, dispatcher, true) as Promise<
                AsyncIterable<unknown>
              >,
          ) as Output,
        );
      }
      return invokeStandalone(request, options, dispatcher, false);
    },
  });
  return dispatcher;
}

async function invokeStandalone<Input, Output, Context extends { readonly signal: AbortSignal }>(
  request: InvocationDispatchRequest<Input, Output, Context>,
  options: InvocationDispatchOptions<Context>,
  dispatcher: InvocationDispatcher,
  streamLifecycle: boolean,
): Promise<Output> {
  const active = currentInvocationScope();
  const activeDispatcher = active?.dispatcher === dispatcher ? active : undefined;
  const parent = options.parent ?? activeDispatcher?.parent;
  const source = options.source ?? "direct";
  assertSource(source);
  assertInvocationMode(request.target, source);
  const now = options.now?.() ?? options.time?.now().getTime() ?? Date.now();
  const deadlineMs = calculateStandaloneDeadline(request.target.timeoutMs, options, parent, now);
  const idSource = options.idSource ?? defaultIdSource;
  const candidateTraceId = options.traceId ?? parent?.traceId ?? idSource.next("trace");
  const traceId = isTraceId(candidateTraceId) ? candidateTraceId : createTraceId();
  const recordOptions =
    parent === undefined || parent === options.parent ? options : { ...options, parent };
  const identity = resolveDescriptorIdentity(request.target);
  const record = createStandaloneRecord(
    identity.id,
    source,
    recordOptions,
    traceId,
    deadlineMs,
    now,
    idSource,
    undefined,
  );
  await callHook(options.onInvocationStart, record);

  const controller = new AbortController();
  const unlink = linkSignals(controller, [options.signal, parent?.signal]);
  const time = options.time ?? createLocalClock(controller.signal, options.now);
  const runner = options.effectRunner ?? defaultRunner;
  const progress =
    request.target.progress === undefined
      ? undefined
      : createProgressEmitter(request.target.progress, controller.signal, options.progressSink);
  let value: Output | undefined;
  let error: InvocationValidationError | InvocationFailure | undefined;
  let outcome: Exclude<import("./contracts.js").InvocationRecord["status"], "started"> = "defect";
  let chain: InvocationCallStack | undefined;
  let deferredCompletion = false;
  const finish = createStandaloneFinisher({
    record,
    options,
    now: () => options.now?.() ?? time.now().getTime(),
    settleProgress: progress?.settle,
    unlink,
  });
  try {
    chain = (activeDispatcher?.chain ?? createInvocationCallStack()).enterDescriptor(
      request.target,
      record.id,
    );
    if (controller.signal.aborted) {
      throw normalizeFailure(controller.signal.reason, { signal: controller.signal });
    }
    const input = await validated(request.target.input, request.input, "input");
    if (deadlineMs !== undefined && deadlineMs <= now) {
      throw normalizeFailure(new Error("Invocation deadline expired"), {
        signal: controller.signal,
        timedOut: true,
      });
    }
    const context = await makeStandaloneContext<Context>({
      ...(options.context === undefined ? {} : { factory: options.context }),
      record,
      signal: controller.signal,
      env: options.env ?? {},
      time,
      publishes: request.target.publishes ?? [],
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.clients === undefined ? {} : { clients: options.clients }),
      ...(progress === undefined ? {} : { progress: progress.emitter }),
    });
    const result = await runInInvocationScope(
      {
        dispatcher,
        parent: standaloneParent(record, controller.signal, deadlineMs),
        chain,
      },
      () =>
        runStandaloneLifecycle({
          target: request.target,
          input,
          context,
          ...(options.toolHooks === undefined ? {} : { toolHooks: options.toolHooks }),
          ...(deadlineMs === undefined ? {} : { deadline: deadlineMs }),
          runner,
          signal: controller.signal,
        }),
    );
    value = (await validated(request.target.output, result, "output")) as Output;
    if (streamLifecycle && isStreamOutput(request.target.output)) {
      const parentScope = standaloneParent(record, controller.signal, deadlineMs);
      deferredCompletion = true;
      value = managedValidatedStream({
        source: value as AsyncIterable<unknown>,
        schema: request.target.output.item,
        maxItemBytes: 1024 * 1024,
        idleMs: 45_000,
        abort: (reason) => controller.abort(reason),
        run: (work) =>
          runInInvocationScope({ dispatcher, parent: parentScope, chain: chain! }, work),
        settle: async (streamCause) => {
          const streamError =
            streamCause === undefined
              ? undefined
              : normalizeFailure(streamCause, { signal: controller.signal });
          await finish(streamError?.outcome ?? "success", streamError);
        },
      }) as Output;
    } else {
      outcome = "success";
    }
  } catch (cause) {
    error =
      cause instanceof InvocationValidationError && cause.phase === "input"
        ? cause
        : cause instanceof InvocationValidationError
          ? normalizeFailure(cause)
          : normalizeFailure(cause, { signal: controller.signal });
    error = await validateDeclaredError(request.target.errors, error);
    outcome = error instanceof InvocationValidationError ? "validation-error" : error.outcome;
  } finally {
    if (!deferredCompletion) await finish(outcome, error);
  }
  if (error !== undefined) throw error;
  return value as Output;
}
