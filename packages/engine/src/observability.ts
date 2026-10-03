import { PROTOCOL_VERSION } from "@relkit/contracts";
import { createObservabilityCollector, type ObservabilityCollector } from "@relkit/observability";
import type {
  InspectableObservabilityHooks,
  InvocationObservabilityHooks,
  ObservabilityHookEvent,
} from "./observability.types.js";
export type {
  InspectableObservabilityHooks,
  InvocationObservabilityHooks,
  ObservabilityHookEvent,
  ObservabilityHooks,
} from "./observability.types.js";

/** Protocol identifier for compatibility invocation observation events. */
export const OBSERVABILITY_HOOK_PROTOCOL = "relkit.observability.hooks" as const;
/** Version of compatibility invocation observation events. */
export const OBSERVABILITY_HOOK_VERSION = PROTOCOL_VERSION;

/**
 * Sends a hook event without allowing telemetry failures to affect execution.
 * The event sink is intentionally not a storage or query API; Phase 11 owns that boundary.
 * @returns A Promise settling after delivery or suppression of an advisory sink failure.
 * @param hooks - Optional invocation sink; absence makes delivery a no-op.
 * @param event - Versioned event frozen before delivery to the sink.
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

/** Create a bounded in-memory observation sink for inspection and tests.
 * @returns A bounded versioned sink with read/clear inspection methods.
 */
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
    capture: collector.capture,
    collect: collector.collect,
    read: (): readonly ObservabilityHookEvent[] => Object.freeze([...events]),
    readRecords: collector.read,
    clear: (): void => {
      events.length = 0;
      collector.clear();
    },
  });
}
