/** Publishes tool lifecycle observations for native calls with stable call identity, preserving failure and completion ordering. This companion preserves the native input and output types without starting runtime work. */

import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.types.js";

/** Runtime integrations needed to emit tool events and resolve approval.
 * The invocation options supply the approval callback and content sink.
 * @example const options: RuntimeToolOptions = { ...runtime, input };
 */
export type RuntimeToolOptions = AgentRuntimeOptions & AgentInvocationOptions;
