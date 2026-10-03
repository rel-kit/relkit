import type { MaybePromise } from "@relkit/contracts";
import type { GraphEdge, ObservedEdge } from "@relkit/graph";
import type { ObservabilityRecord } from "@relkit/observability";
import type {
  InvocationCompletion,
  InvocationRecord,
  InvocationRelease,
  SpanRecord,
} from "./invoke-types.js";
import type { OBSERVABILITY_HOOK_PROTOCOL, OBSERVABILITY_HOOK_VERSION } from "./observability.js";

/** Versioned lifecycle, span and dependency events emitted by engine compatibility hooks. */
export type ObservabilityHookEvent =
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "invocation.started";
      readonly record: InvocationRecord;
    }
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "span.started";
      readonly record: SpanRecord;
    }
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "span.completed";
      readonly record: SpanRecord;
    }
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "span.updated";
      readonly record: SpanRecord;
    }
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "edge.declared";
      readonly edge: GraphEdge;
    }
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "edge.observed";
      readonly edge: ObservedEdge;
    }
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "invocation.completed";
      readonly completion: InvocationCompletion;
    }
  | {
      readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
      readonly version: typeof OBSERVABILITY_HOOK_VERSION;
      readonly type: "invocation.released";
      readonly release: InvocationRelease;
    };

/** Advisory versioned sink; return values are ignored and failures isolated. */
export interface InvocationObservabilityHooks {
  readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
  readonly version: typeof OBSERVABILITY_HOOK_VERSION;
  readonly emit: (event: ObservabilityHookEvent) => MaybePromise<unknown>;
  readonly capture?: import("@relkit/observability").RequestRecordSink["capture"];
}

/** Compatibility alias for the versioned invocation observability sink. */
export type ObservabilityHooks = InvocationObservabilityHooks;

/** Hook inspection remains a compatibility view; admitted records use the bounded collector. */
export interface InspectableObservabilityHooks extends InvocationObservabilityHooks {
  readonly collect: (record: ObservabilityRecord) => ObservabilityRecord | undefined;
  readonly read: () => readonly ObservabilityHookEvent[];
  readonly readRecords: () => readonly ObservabilityRecord[];
  readonly clear: () => void;
}
