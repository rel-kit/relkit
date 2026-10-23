/**
 * Resolves the earliest authored deadline before the signal owner installs its
 * timer. Invalid timeout/deadline values preserve the existing public diagnostic.
 */
import type { ExecutionSignalOptions } from "./signal.types.js";
import { AgentRuntimeError } from "./runtime-errors.js";

/** Selects the earliest finite invocation deadline.
 * @param options - Agent limit, optional timeout and absolute deadline.
 * @param now - Current milliseconds from the replaceable execution clock.
 * @returns The absolute deadline in milliseconds.
 */
export function executionDeadline(options: ExecutionSignalOptions, now: number): number {
  const deadlines = [now + options.agent.limits.timeoutMs, options.deadlineMs];
  if (
    options.timeoutMs !== undefined &&
    (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0)
  ) {
    throw new AgentRuntimeError("RELKIT_AGENT_DEADLINE_INVALID", "Agent timeout is invalid");
  }
  if (options.timeoutMs !== undefined) deadlines.push(now + options.timeoutMs);
  if (deadlines.some((deadline) => deadline !== undefined && !Number.isFinite(deadline))) {
    throw new AgentRuntimeError("RELKIT_AGENT_DEADLINE_INVALID", "Agent deadline is invalid");
  }
  const deadline = Math.min(...deadlines.filter((value): value is number => value !== undefined));
  return deadline;
}
