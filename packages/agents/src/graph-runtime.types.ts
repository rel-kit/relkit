import type { GraphDescriptor } from "./define-graph.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.types.js";

/** Runtime options for invoking a compiled graph descriptor. */
export type GraphRuntimeOptions = AgentRuntimeOptions &
  AgentInvocationOptions & { readonly agent: GraphDescriptor };
