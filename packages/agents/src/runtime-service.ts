import { Context, Effect, Layer } from "effect";
import { invokeGraph } from "./graph-runtime.js";
import { runAgentLoop } from "./runtime-loop.js";
import { resolveRuntimeModel } from "./runtime-model.js";
import type { AgentExecutionService } from "./runtime-service.types.js";

export type { AgentExecutionService } from "./runtime-service.types.js";

/** Injectable model, graph, loop, and identity boundary.
 * @example Effect.provide(invokeAgentEffect(options), AgentExecutionLive);
 */
export class AgentExecution extends Context.Service<AgentExecution, AgentExecutionService>()(
  "relkit/agents/AgentExecution",
) {}

/** Live agent integrations used by the Promise compatibility API.
 * @example Effect.runPromise(Effect.provide(invokeAgentEffect(options), AgentExecutionLive));
 */
export const AgentExecutionLive = Layer.effect(
  AgentExecution,
  Effect.sync(() =>
    AgentExecution.of({
      resolveModel: resolveRuntimeModel,
      runLoop: runAgentLoop,
      invokeGraph,
      randomUUID: () => crypto.randomUUID(),
    }),
  ),
);
