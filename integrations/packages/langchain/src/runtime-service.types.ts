/** Provides the Effect runtime service that composes native model resolution, tools and loop execution under the invocation owner. This companion preserves the native input and output types without starting runtime work. */

import type { invokeGraph } from "./graph-runtime.js";
import type { runAgentLoop } from "./runtime-loop.js";
import type { resolveRuntimeModel } from "./runtime-model.js";

/** Substitutable integrations used while invoking an agent. */
export interface AgentExecutionService {
  readonly resolveModel: typeof resolveRuntimeModel;
  readonly runLoop: typeof runAgentLoop;
  readonly invokeGraph: typeof invokeGraph;
  readonly randomUUID: () => string;
}
