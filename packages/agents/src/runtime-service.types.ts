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
