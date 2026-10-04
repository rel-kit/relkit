import type { Invoke } from "./agent-methods.types.js";
import type { AgentBase, AgentStopOptions, AgentThreadOptions } from "./agent-hook-types.types.js";

/**
 * Projects declared agent methods over the view's borrowed invocation and observation adapters.
 * @typeParam Output - Declared successful output payload.
 * @param state - Current owned state.
 * @param invoke - Borrowed accepted-work invocation adapter.
 * @param observe - Borrowed thread observation adapter.
 * @returns Declared agent invocation and observation methods.
 */
export function agentMethods<Output>(
  state: AgentBase<Output>,
  invoke: Invoke,
  observe: (options: AgentThreadOptions) => Promise<void>,
) {
  return {
    ...state,
    observe,
    run: (input: unknown, options: AgentThreadOptions) => invoke("run", input, options),
    send: (message: string, options: AgentThreadOptions) => invoke("run", message, options),
    steer: (message: string, options: AgentThreadOptions) => invoke("steer", message, options),
    followUp: (message: string, options: AgentThreadOptions) =>
      invoke("follow-up", message, options),
    stop: (options: AgentStopOptions) =>
      invoke("stop", { mode: options.mode ?? "graceful" }, options),
    approve: (approvalId: string, options: AgentThreadOptions) =>
      invoke("approve", { approvalId, decision: "approve" }, options),
    deny: (approvalId: string, options: AgentThreadOptions) =>
      invoke("approve", { approvalId, decision: "deny" }, options),
  };
}
