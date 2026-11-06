import type { ActiveAgentExecution, AgentSteeringBuffer } from "./agent-active-execution.types.js";
export type { ActiveAgentExecution, AgentSteeringBuffer } from "./agent-active-execution.types.js";

/** Creates the run-owned buffer used to exchange steering input with execution.
 * @returns An independent run-owned steering buffer.
 */
export function createAgentSteeringBuffer(): AgentSteeringBuffer {
  const pending: string[] = [];
  return Object.freeze({
    push: (message: string) => pending.push(message),
    drain: () => pending.splice(0),
  });
}
