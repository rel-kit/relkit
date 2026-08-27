import type { MaybePromise } from "@relkit/contracts";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.js";
import { AgentRuntimeError } from "./runtime-errors.js";

export function signalFailure(signal: AbortSignal): AgentRuntimeError {
  return signal.reason instanceof AgentRuntimeError && signal.reason.code === "RELKIT_AGENT_TIMEOUT"
    ? signal.reason
    : new AgentRuntimeError("RELKIT_AGENT_CANCELLED", "Agent invocation cancelled");
}

export function createExecutionSignal(options: AgentRuntimeOptions & AgentInvocationOptions): {
  readonly signal: AbortSignal;
  readonly close: () => void;
} {
  const controller = new AbortController();
  const listeners: Array<readonly [AbortSignal, () => void]> = [];
  const now = Date.now();
  const deadlines = [now + options.agent.limits.timeoutMs, options.deadlineMs];
  if (
    options.timeoutMs !== undefined &&
    (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0)
  )
    throw new AgentRuntimeError("RELKIT_AGENT_DEADLINE_INVALID", "Agent timeout is invalid");
  if (options.timeoutMs !== undefined) deadlines.push(now + options.timeoutMs);
  if (deadlines.some((deadline) => deadline !== undefined && !Number.isFinite(deadline)))
    throw new AgentRuntimeError("RELKIT_AGENT_DEADLINE_INVALID", "Agent deadline is invalid");
  const deadline = Math.min(...deadlines.filter((value): value is number => value !== undefined));
  const timeout = new AgentRuntimeError("RELKIT_AGENT_TIMEOUT", "Agent deadline exceeded");
  if (deadline <= now) controller.abort(timeout);
  const timer = setTimeout(() => controller.abort(timeout), Math.max(0, deadline - now));
  const signal = options.signal;
  if (signal !== undefined) {
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      listeners.push([signal, abort]);
    }
  }
  return {
    signal: controller.signal,
    close: () => {
      clearTimeout(timer);
      for (const [source, listener] of listeners) source.removeEventListener("abort", listener);
    },
  };
}

export function withSignal<T>(work: MaybePromise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signalFailure(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signalFailure(signal));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(work)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
