import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.types.js";

/** Runtime integrations needed to emit tool events and resolve approval.
 * The invocation options supply the approval callback and content sink.
 * @example const options: RuntimeToolOptions = { ...runtime, input };
 */
export type RuntimeToolOptions = AgentRuntimeOptions & AgentInvocationOptions;
