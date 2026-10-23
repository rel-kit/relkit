/**
 * Resolves model and invocation identities before acquiring the scoped native
 * signal; stream work inherits the same tracing and cancellation context.
 */
import { normalizeId } from "@relkit/contracts";
import { frameworkTrace } from "@relkit/invocation";
import { Effect } from "effect";
import { createAgentCapturePolicyEffect } from "@relkit/agents/internal/capture-policy";
import { generatedAgentFunctionId } from "@relkit/agents/internal/generated-function";
import { signalFailure, validateValue, withSignal } from "./runtime-utils.js";
import { acquireExecutionSignalEffect, ExecutionSignalClockLive } from "./signal.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import type { AgentExecutionService } from "./runtime-service.types.js";
import type { NativeAgentRuntimeOptions } from "./runtime-native-agent.types.js";

/** Resolves validated invocation identity, capture policy and native model.
 * @param options - Agent runtime and invocation inputs.
 * @param service - Selected native execution service.
 * @returns Validated native dependencies or the original tagged failure.
 */
export const resolveNativeInvocationEffect = Effect.fn("Agents.runtime.resolveInvocation")(
  function* (options: NativeAgentRuntimeOptions, service: AgentExecutionService) {
    const agent = options.agent;
    const capture = yield* createAgentCapturePolicyEffect(options.capture).pipe(
      Effect.mapError((error) => agentInvocationFailure(new TypeError(error.message))),
    );
    const invocationId = yield* Effect.try({
      try: () => normalizeId(options.invocationId ?? `agent-${service.randomUUID()}`),
      catch: agentInvocationFailure,
    });
    const traceId = yield* Effect.try({
      try: () => normalizeId(options.traceId ?? invocationId),
      catch: agentInvocationFailure,
    });
    const runtimeModel = yield* Effect.tryPromise({
      try: () =>
        service.resolveModel({
          ...(agent.model === undefined ? {} : { model: agent.model }),
          registry: options.modelRegistry,
          environment: options.environment ?? {},
          ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }),
          ...(options.maxOutputBytes === undefined
            ? {}
            : { maxOutputBytes: options.maxOutputBytes }),
        }),
      catch: agentInvocationFailure,
    });
    return { capture, invocationId, traceId, runtimeModel };
  },
);

/** Runs native work inside the original scoped signal and trace boundary.
 * @param options - Agent runtime and invocation inputs.
 * @param service - Selected native execution service.
 * @param invocation - Resolved identity, model and capture policy.
 * @returns Native output with linked cancellation and scoped cleanup.
 */
export const invokeNativeWithContextEffect = Effect.fn("Agents.runtime.invokeNative")(function* (
  options: NativeAgentRuntimeOptions,
  service: AgentExecutionService,
  invocation: Effect.Success<ReturnType<typeof resolveNativeInvocationEffect>>,
) {
  const { capture, invocationId, traceId, runtimeModel } = invocation;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const execution = yield* acquireExecutionSignalEffect(options).pipe(
        Effect.provide(ExecutionSignalClockLive),
      );
      return yield* Effect.tryPromise({
        try: (effectSignal) => {
          const signal = AbortSignal.any([execution.signal, effectSignal]);
          return frameworkTrace.span(
            `relkit.agent.${options.agent.id}.invoke`,
            {
              input: options.input,
              attributes: {
                "relkit.agent.id": options.agent.id,
                "relkit.function.id": generatedAgentFunctionId(options.agent.id),
                "relkit.invocation.id": invocationId,
                "relkit.model.id": runtimeModel.id,
              },
            },
            async () => {
              if (signal.aborted) throw signalFailure(signal);
              const input = options.resume
                ? options.input
                : await withSignal(
                    validateValue(options.agent.input, options.input, "input"),
                    signal,
                  );
              return service.runLoop(
                options,
                runtimeModel.model,
                runtimeModel.id,
                signal,
                input,
                runtimeModel.maxInputBytes,
                runtimeModel.maxOutputBytes,
                invocationId,
                traceId,
                capture,
              );
            },
          );
        },
        catch: agentInvocationFailure,
      });
    }),
  );
});
