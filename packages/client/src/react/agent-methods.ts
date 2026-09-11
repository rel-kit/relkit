import type { AgentBase, AgentStopOptions, AgentThreadOptions } from "./agent-hook-types.js";

type Invoke = (
  kind: string,
  payload: unknown,
  options: AgentThreadOptions & { readonly resume?: boolean },
) => Promise<void>;

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
