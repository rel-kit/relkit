/** Composes graph compilation, scoped persistence and execution into the native invocation entrypoint, retaining stream and continuation behavior. This companion preserves the native input and output types without starting runtime work. */

import type { GraphDescriptor } from "./define-graph.js";
import type { AgentInvocationOptions, AgentRuntimeOptions } from "./runtime.types.js";

/** Runtime options for invoking a compiled graph descriptor. */
export type GraphRuntimeOptions = AgentRuntimeOptions &
  AgentInvocationOptions & { readonly agent: GraphDescriptor };
