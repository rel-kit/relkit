import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import type { AgentObservedEdge, AgentRuntimeHooks } from "./observability.types.js";

export {
  captureAgentContent, captureAgentContentEffect, createAgentCapturePolicy,
  createAgentCapturePolicyEffect, createAgentSpanCapture, createAgentSpanCaptureEffect,
  AgentCapturePolicyError,
} from "./capture.js";
export type { AgentCapturePolicy, AgentCaptureRecord, AgentSpanCapture } from "./capture.js";
export type * from "./observability.types.js";

export const AGENT_OBSERVABILITY_PROTOCOL = "relkit.observability.hooks" as const;
export const AGENT_OBSERVABILITY_VERSION = 1 as const;

/** Best-effort emission of an observed relationship.
 * The sink is intentionally detached because the caller's synchronous tracing path cannot await it.
 * @param hooks - Optional tracing hooks.
 * @param edge - Relationship to emit.
 * @returns An Effect with void; hook errors are intentionally suppressed.
 * @example Effect.runSync(emitAgentEdgeEffect(hooks, edge));
 */
export const emitAgentEdgeEffect = Effect.fn("Agents.observability.emitEdge")((
  hooks: AgentRuntimeHooks | undefined,
  edge: AgentObservedEdge,
) => Effect.sync(() => {
  const safe = Object.freeze({ ...edge });
  try {
    hooks?.onObservedEdge?.(safe);
  } catch {}
  try {
    const result = hooks?.observability?.emit({
      protocol: AGENT_OBSERVABILITY_PROTOCOL,
      version: AGENT_OBSERVABILITY_VERSION,
      type: "edge.observed",
      edge: safe,
    });
    if (result !== undefined) void Promise.resolve(result).catch(() => undefined);
  } catch {}
}), (effect) => observeAgent("observability.emit-edge", effect));

/** Emits an observed relationship for existing synchronous tracing callers.
 * @param hooks - Optional tracing hooks.
 * @param edge - Relationship to emit.
 * @returns Nothing; sink delivery runs in the background.
 * @example emitAgentEdge(hooks, { relationship: "uses-tool", from: "agent", to: "tool" });
 */
export function emitAgentEdge(hooks: AgentRuntimeHooks | undefined, edge: AgentObservedEdge): void {
  Effect.runSync(emitAgentEdgeEffect(hooks, edge));
}
