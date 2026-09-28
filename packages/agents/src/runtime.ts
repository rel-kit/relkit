import { normalizeId } from "@relkit/contracts";
import { frameworkTrace } from "@relkit/invocation";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { createAgentCapturePolicyEffect } from "./capture-policy.js";
import {
  signalFailure,
  validateValue,
  withSignal,
} from "./runtime-utils.js";
import { acquireExecutionSignalEffect, ExecutionSignalClockLive } from "./signal.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { generatedAgentFunctionId } from "./generated-function.js";
import { isGraphDescriptor } from "./define-graph.js";
import { AgentExecution, AgentExecutionLive } from "./runtime-service.js";
import type { AgentInvocationOptions, AgentRuntime, AgentRuntimeOptions } from "./runtime.types.js";

export type * from "./runtime.types.js";

export { AgentRuntimeError } from "./runtime-errors.js";
export { AgentInvocationFailure } from "./runtime-effect-error.js";

/** Invokes an agent with typed failures and interruption linked to its work.
 * @param options - Runtime dependencies and invocation input.
 * @returns An Effect with the agent result or AgentInvocationFailure.
 * @example Effect.runPromise(Effect.provide(invokeAgentEffect(options), AgentExecutionLive));
 */
export const invokeAgentEffect = Effect.fn("Agents.runtime.invoke")(function* (
  options: AgentRuntimeOptions & AgentInvocationOptions,
){
  const service = yield* AgentExecution;
  const agent = options.agent;
  if (isGraphDescriptor(agent)) {
    return yield* Effect.tryPromise({
      try: (effectSignal) =>
        service.invokeGraph({
          ...options,
          agent,
          signal:
            options.signal === undefined
              ? effectSignal
              : AbortSignal.any([options.signal, effectSignal]),
        }),
      catch: agentInvocationFailure,
    });
  }
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
        ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
      }),
    catch: agentInvocationFailure,
  });
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
                : await withSignal(validateValue(options.agent.input, options.input, "input"), signal);
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
}, (effect) => observeAgent("runtime.invoke", effect));

/** Runs an agent through the live Effect Layer for existing Promise callers.
 * @param options - Runtime dependencies and invocation input.
 * @returns The agent result.
 * @throws The original validation, provider, cancellation, or runtime error.
 * @example await invokeAgent({ ...options, input: { message: "hi" } });
 */
export function invokeAgent(options: AgentRuntimeOptions & AgentInvocationOptions): Promise<unknown> {
  return Effect.runPromise(
    invokeAgentEffect(options).pipe(
      Effect.catchTag("AgentInvocationFailure", (error) => Effect.fail(error.cause)),
      Effect.provide(AgentExecutionLive),
    ),
  );
}

/** Creates a reusable runtime through an observable Effect.
 * @param options - Agent, model, tool, and engine dependencies.
 * @returns An Effect with a frozen runtime and no typed failure.
 * @example Effect.runSync(createAgentRuntimeEffect(options));
 */
export const createAgentRuntimeEffect = Effect.fn("Agents.runtime.create")(function* (
  options: AgentRuntimeOptions,
) {
  return yield* Effect.sync(
    (): AgentRuntime =>
      Object.freeze({
        invoke: (input: unknown, invocation: Omit<AgentInvocationOptions, "input"> = {}) =>
          invokeAgent({ ...options, ...invocation, input }),
      }),
  );
}, (effect) => observeAgent("runtime.create", effect));

/** Binds one agent catalog for existing synchronous callers.
 * @param options - Agent, model, tool, and engine dependencies.
 * @returns A frozen reusable runtime.
 * @example const runtime = createAgentRuntime(options);
 */
export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  return Effect.runSync(createAgentRuntimeEffect(options));
}

export const runAgent = invokeAgent;
