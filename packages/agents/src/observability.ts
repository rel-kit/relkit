import type { MaybePromise } from "@relkit/contracts";

export {
  captureAgentContent,
  createAgentCapturePolicy,
  createAgentSpanCapture,
} from "./capture.js";
export type { AgentCapturePolicy, AgentCaptureRecord, AgentSpanCapture } from "./capture.js";

export const AGENT_OBSERVABILITY_PROTOCOL = "relkit.observability.hooks" as const;
export const AGENT_OBSERVABILITY_VERSION = 1 as const;

export type AgentEdgeRelationship =
  | "targets-function"
  | "calls-function"
  | "enqueues-job"
  | "publishes-event"
  | "listens-to-event"
  | "uses-bucket"
  | "uses-cache"
  | "invokes-agent"
  | "exposes-as-tool"
  | "uses-tool"
  | "uses-provider-profile";

export interface AgentObservedEdge {
  readonly relationship: AgentEdgeRelationship;
  readonly from: string;
  readonly to: string;
}

export interface AgentObservabilitySink {
  readonly emit: (event: {
    readonly protocol: typeof AGENT_OBSERVABILITY_PROTOCOL;
    readonly version: typeof AGENT_OBSERVABILITY_VERSION;
    readonly type: "edge.observed";
    readonly edge: AgentObservedEdge;
  }) => MaybePromise<void>;
}

export interface AgentRuntimeHooks {
  readonly onObservedEdge?: (edge: AgentObservedEdge) => void;
  readonly observability?: AgentObservabilitySink;
}

export function emitAgentEdge(hooks: AgentRuntimeHooks | undefined, edge: AgentObservedEdge): void {
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
}
