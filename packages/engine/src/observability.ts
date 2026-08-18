import { PROTOCOL_VERSION, type MaybePromise } from "@zsys/contracts";
import {
  createObservabilityCollector,
  type ObservabilityCollector,
  type ObservabilityRecord,
} from "@zsys/observability";
import type { GraphEdge, ObservedEdge } from "@zsys/graph";
import type {
  InvocationCompletion,
  InvocationRecord,
  InvocationRelease,
  SpanRecord,
} from "./invoke-types.js";

export const OBSERVABILITY_HOOK_PROTOCOL = "zsys.observability.hooks" as const;
export const OBSERVABILITY_HOOK_VERSION = PROTOCOL_VERSION;

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

export interface InvocationObservabilityHooks {
  readonly protocol: typeof OBSERVABILITY_HOOK_PROTOCOL;
  readonly version: typeof OBSERVABILITY_HOOK_VERSION;
  readonly emit: (event: ObservabilityHookEvent) => MaybePromise<void>;
}

export type ObservabilityHooks = InvocationObservabilityHooks;

/**
 * Sends a hook event without allowing telemetry failures to affect execution.
 * The event sink is intentionally not a storage or query API; Phase 11 owns that boundary.
 */
export async function emitObservabilityEvent(
  hooks: InvocationObservabilityHooks | undefined,
  event: ObservabilityHookEvent,
): Promise<void> {
  try {
    await hooks?.emit(Object.freeze(event));
  } catch {
    // Observability hooks are advisory and cannot replace invocation behavior.
  }
}

/** Hook inspection remains a compatibility view; admitted records use the bounded collector. */
export interface InspectableObservabilityHooks extends InvocationObservabilityHooks {
  readonly collect: (record: ObservabilityRecord) => ObservabilityRecord | undefined;
  readonly read: () => readonly ObservabilityHookEvent[];
  readonly readRecords: () => readonly ObservabilityRecord[];
  readonly clear: () => void;
}

export function createInspectableObservabilityHooks(): InspectableObservabilityHooks {
  const events: ObservabilityHookEvent[] = [];
  const collector: ObservabilityCollector = createObservabilityCollector();
  return Object.freeze({
    protocol: OBSERVABILITY_HOOK_PROTOCOL,
    version: OBSERVABILITY_HOOK_VERSION,
    emit: (event: ObservabilityHookEvent): void => {
      events.push(event);
      collector.emit(event);
    },
    collect: collector.collect,
    read: (): readonly ObservabilityHookEvent[] => Object.freeze([...events]),
    readRecords: collector.read,
    clear: (): void => {
      events.length = 0;
      collector.clear();
    },
  });
}
