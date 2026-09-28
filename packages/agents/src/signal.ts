import type { MaybePromise } from "@relkit/contracts";
import { Context, Effect, Layer } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { agentInvocationFailure } from "./runtime-effect-error.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import type {
  ExecutionSignalClockService, ExecutionSignalHandle, ExecutionSignalOptions,
} from "./signal.types.js";

export type * from "./signal.types.js";

/** Replaceable clock and timer boundary for execution deadlines.
 * @example Effect.provide(createExecutionSignalEffect(options), ExecutionSignalClockLive);
 */
export class ExecutionSignalClock extends Context.Service<ExecutionSignalClock, ExecutionSignalClockService>()(
  "relkit/agents/ExecutionSignalClock",
) {}

/** Live wall clock and timer implementation.
 * @example Effect.runSync(Effect.provide(createExecutionSignalEffect(options), ExecutionSignalClockLive));
 */
export const ExecutionSignalClockLive = Layer.succeed(ExecutionSignalClock, ExecutionSignalClock.of({
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}));

/** Converts an abort reason to a safe invocation error.
 * @param signal - Aborted invocation signal.
 * @returns An Effect with a timeout or cancellation error.
 * @example Effect.runSync(signalFailureEffect(signal));
 */
export const signalFailureEffect = Effect.fn("Agents.signal.failure")((signal: AbortSignal) =>
  Effect.sync(() => signal.reason instanceof AgentRuntimeError && signal.reason.code === "RELKIT_AGENT_TIMEOUT"
    ? signal.reason
    : new AgentRuntimeError("RELKIT_AGENT_CANCELLED", "Agent invocation cancelled")),
  (effect) => observeAgent("signal.failure", effect));

/** Converts an abort reason for existing synchronous callers.
 * @param signal - Aborted invocation signal.
 * @returns A safe timeout or cancellation error.
 * @example signalFailure(signal);
 */
export function signalFailure(signal: AbortSignal): AgentRuntimeError {
  return Effect.runSync(signalFailureEffect(signal));
}

/** Creates a live execution signal with an owned timer and caller listener.
 * @param options - Invocation limits, deadline, and caller signal.
 * @returns An Effect with a closeable signal or AgentInvocationFailure.
 * @example Effect.runSync(Effect.provide(createExecutionSignalEffect(options), testClock));
 */
export const createExecutionSignalEffect = Effect.fn("Agents.signal.create")(
  function* (options: ExecutionSignalOptions) {
    const clock = yield* ExecutionSignalClock;
    return yield* Effect.try({
      try: (): ExecutionSignalHandle => {
        const controller = new AbortController();
        const listeners: Array<readonly [AbortSignal, () => void]> = [];
        const now = clock.now();
        const deadlines = [now + options.agent.limits.timeoutMs, options.deadlineMs];
        if (options.timeoutMs !== undefined &&
          (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0)) {
          throw new AgentRuntimeError("RELKIT_AGENT_DEADLINE_INVALID", "Agent timeout is invalid");
        }
        if (options.timeoutMs !== undefined) deadlines.push(now + options.timeoutMs);
        if (deadlines.some((deadline) => deadline !== undefined && !Number.isFinite(deadline))) {
          throw new AgentRuntimeError("RELKIT_AGENT_DEADLINE_INVALID", "Agent deadline is invalid");
        }
        const deadline = Math.min(...deadlines.filter((value): value is number => value !== undefined));
        const timeout = new AgentRuntimeError("RELKIT_AGENT_TIMEOUT", "Agent deadline exceeded");
        if (deadline <= now) controller.abort(timeout);
        const timer = clock.setTimeout(() => controller.abort(timeout), Math.max(0, deadline - now));
        const signal = options.signal;
        if (signal !== undefined) {
          const abort = () => controller.abort(signal.reason);
          if (signal.aborted) abort();
          else {
            signal.addEventListener("abort", abort, { once: true });
            listeners.push([signal, abort]);
          }
        }
        let closed = false;
        return {
          signal: controller.signal,
          close: () => {
            if (closed) return;
            closed = true;
            clock.clearTimeout(timer);
            for (const [source, listener] of listeners) source.removeEventListener("abort", listener);
          },
        };
      },
      catch: agentInvocationFailure,
    });
  },
  (effect) => observeAgent("signal.create", effect),
);

/** Acquires an execution signal whose owner closes it with its Effect scope.
 * @param options - Invocation limits, deadline, and caller signal.
 * @returns A scoped Effect with a signal or AgentInvocationFailure.
 * @example Effect.scoped(Effect.gen(function* () { const active = yield* acquireExecutionSignalEffect(options); }));
 */
export const acquireExecutionSignalEffect = Effect.fn("Agents.signal.acquire")((options: ExecutionSignalOptions) =>
  Effect.acquireRelease(createExecutionSignalEffect(options), (active) => Effect.sync(() => active.close())),
  (effect) => observeAgent("signal.acquire", effect));

/** Creates a live signal for existing callers that own and close the handle.
 * @param options - Invocation limits, deadline, and caller signal.
 * @returns A closeable execution signal.
 * @throws The original invalid deadline error.
 * @example const active = createExecutionSignal(options); try { await work(active.signal); } finally { active.close(); }
 */
export function createExecutionSignal(options: ExecutionSignalOptions): ExecutionSignalHandle {
  return Effect.runSync(createExecutionSignalEffect(options).pipe(
    Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
    Effect.provide(ExecutionSignalClockLive),
  ));
}

/** Races Promise work with caller and Effect cancellation.
 * @param work - Already started Promise or immediate value.
 * @param signal - Caller cancellation signal.
 * @param linkEffectSignal - Whether to link direct Effect interruption.
 * @returns An Effect with the value or AgentInvocationFailure.
 * @example await Effect.runPromise(withSignalEffect(work, signal));
 */
export const withSignalEffect = Effect.fn("Agents.signal.withSignal")(<T>(
  work: MaybePromise<T>, signal: AbortSignal, linkEffectSignal = true,
) => Effect.tryPromise({
  try: (effectSignal) => withSignalCore(work,
    linkEffectSignal ? AbortSignal.any([signal, effectSignal]) : signal),
  catch: agentInvocationFailure,
}), (effect) => observeAgent("signal.with-signal", effect));

/** Races work with a caller signal for existing Promise callers.
 * @param work - Already started Promise or immediate value.
 * @param signal - Caller cancellation signal.
 * @returns The value when work completes before cancellation.
 * @throws The original work error or AgentRuntimeError on cancellation.
 * @example await withSignal(fetchData(), signal);
 */
export function withSignal<T>(work: MaybePromise<T>, signal: AbortSignal): Promise<T> {
  return Effect.runPromise(withSignalEffect(work, signal, false).pipe(
    Effect.catchTag("AgentInvocationFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

function withSignalCore<T>(work: MaybePromise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signalFailure(signal));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      complete();
    };
    const abort = () => finish(() => reject(signalFailure(signal)));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    Promise.resolve(work).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}
