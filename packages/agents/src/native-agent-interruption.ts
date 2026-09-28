import { Command } from "@langchain/langgraph";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { nativeAgentInterruptionFailure } from "./native-agent-interruption-error.js";
import type { NativeAgent, NativeAgentConfig } from "./native-agent-interruption.types.js";
import { snapshotInterrupts, validateNativeAgentResumeInputCore } from "./native-agent-interruption-validation.js";
import type { AgentWaitingRequest } from "./state.types.js";

/** Reads native pending requests and constructs a resume command.
 * @param agent - Native agent state provider.
 * @param config - State lookup configuration.
 * @param value - One reply or an ordered reply list.
 * @returns An Effect with a native Command or NativeAgentInterruptionFailure.
 * @example await Effect.runPromise(nativeAgentResumeCommandEffect(agent, config, reply));
 */
export const nativeAgentResumeCommandEffect = Effect.fn("Agents.nativeHitl.resumeCommand")(
  function* (agent: NativeAgent, config: NativeAgentConfig, value: unknown) {
    const requests = yield* nativeAgentWaitingInterruptsEffect(agent, config);
    const reply = yield* validateNativeAgentResumeInputEffect(requests, value);
    const replies = requests.length === 1 ? [reply] : (reply as readonly unknown[]);
    return yield* Effect.try({
      try: () => new Command({
        resume: Object.fromEntries(requests.map((request, index) => {
          if (request.id === undefined) throw new TypeError("Agent interruption has no native ID");
          return [request.id, replies[index]];
        })),
      }),
      catch: nativeAgentInterruptionFailure,
    });
  },
  (effect) => observeAgent("native-hitl.resume-command", effect),
);

/** Builds a native resume command for existing Promise callers.
 * @param agent - Native agent state provider.
 * @param config - State lookup configuration.
 * @param value - Candidate continuation reply.
 * @returns A native resume command.
 * @throws The original state or validation error.
 * @example await nativeAgentResumeCommand(agent, config, reply);
 */
export function nativeAgentResumeCommand(
  agent: NativeAgent,
  config: NativeAgentConfig,
  value: unknown,
): Promise<Command> {
  return Effect.runPromise(nativeAgentResumeCommandEffect(agent, config, value).pipe(
    Effect.catchTag("NativeAgentInterruptionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Reads and projects waiting native interruptions.
 * @param agent - Native agent state provider.
 * @param config - State lookup configuration.
 * @returns An Effect with ordered waiting requests or NativeAgentInterruptionFailure.
 * @example await Effect.runPromise(nativeAgentWaitingInterruptsEffect(agent, config));
 */
export const nativeAgentWaitingInterruptsEffect = Effect.fn("Agents.nativeHitl.waiting")(
  (agent: NativeAgent, config: NativeAgentConfig) => Effect.tryPromise({
    try: async (effectSignal) => snapshotInterrupts(await agent.getState({
      ...config,
      signal: config.signal === undefined ? effectSignal : AbortSignal.any([config.signal, effectSignal]),
    }, { subgraphs: true }), []),
    catch: nativeAgentInterruptionFailure,
  }),
  (effect) => observeAgent("native-hitl.waiting", effect),
);

/** Reads waiting native interruptions for existing Promise callers.
 * @param agent - Native agent state provider.
 * @param config - State lookup configuration.
 * @returns Ordered waiting requests.
 * @throws The original native state provider error.
 * @example await nativeAgentWaitingInterrupts(agent, config);
 */
export function nativeAgentWaitingInterrupts(
  agent: NativeAgent,
  config: NativeAgentConfig,
): Promise<readonly import("./graph-interruption.js").GraphWaitingInterrupt[]> {
  return Effect.runPromise(nativeAgentWaitingInterruptsEffect(agent, config).pipe(
    Effect.catchTag("NativeAgentInterruptionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Validates native continuation replies against pending requests.
 * @param requests - Pending waiting requests.
 * @param value - One reply or an ordered reply list.
 * @returns An Effect with validated replies or NativeAgentInterruptionFailure.
 * @example Effect.runSync(validateNativeAgentResumeInputEffect(requests, reply));
 */
export const validateNativeAgentResumeInputEffect = Effect.fn("Agents.nativeHitl.validateReply")(
  (requests: readonly AgentWaitingRequest[], value: unknown) => Effect.try({
    try: () => validateNativeAgentResumeInputCore(requests, value),
    catch: nativeAgentInterruptionFailure,
  }),
  (effect) => observeAgent("native-hitl.validate-reply", effect),
);

/** Validates native continuation replies for existing synchronous callers.
 * @param requests - Pending waiting requests.
 * @param value - Candidate reply or ordered reply list.
 * @returns Validated reply values.
 * @throws The original invalid continuation error.
 * @example const reply = validateNativeAgentResumeInput(requests, value);
 */
export function validateNativeAgentResumeInput(
  requests: readonly AgentWaitingRequest[],
  value: unknown,
): unknown {
  return Effect.runSync(validateNativeAgentResumeInputEffect(requests, value).pipe(
    Effect.catchTag("NativeAgentInterruptionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}
