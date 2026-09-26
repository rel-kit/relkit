import { Context, Effect, Layer } from "effect";
import { observeTool, runToolSync } from "./tool-observability.js";
import type { ToolEngine } from "./runtime.types.js";

/** Replaceable engine used by Effect tool invocation.
 * @example Effect.provide(invokeToolEffect(request), ToolEngineLive(engine));
 */
export class ToolEngineService extends Context.Service<ToolEngineService, ToolEngine>()(
  "relkit/tools/ToolEngine",
) {}

/** Constructs a composable engine Layer through Effect.
 * @param engine - Engine implementation.
 * @returns Layer or an unexpected construction defect.
 * @example Effect.runSync(ToolEngineLiveEffect(engine));
 */
export const ToolEngineLiveEffect = Effect.fn("tools.engine-layer")((engine: ToolEngine) =>
  observeTool(
    "engine-layer",
    Effect.sync(() => Layer.succeed(ToolEngineService, engine)),
  ),
);

/** Provides a common engine to an Effect invocation.
 * @param engine - Engine implementation.
 * @returns Layer supplying the tool engine with no failure channel.
 * @throws Unexpected construction defects.
 * @example ToolEngineLive({ invoke: async ({ input }) => input });
 */
export function ToolEngineLive(engine: ToolEngine) {
  return runToolSync(ToolEngineLiveEffect(engine));
}
