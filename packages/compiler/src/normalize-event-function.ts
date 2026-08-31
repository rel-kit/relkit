import { add } from "./normalize-pass-utils.js";
import { isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

export function normalizeEventFunctions(
  work: NormalizationWork,
  descriptors: readonly NormalizedDescriptor[],
): NormalizedDescriptor[] {
  const ids = new Set(descriptors.map((descriptor) => descriptor.id));
  return descriptors.flatMap((descriptor) => {
    if (descriptor.kind !== "function" || !isRecord(descriptor.value)) return [descriptor];
    if (descriptor.value.invocationMode !== "event-only") return [descriptor];
    const triggerId = `relkit.event.${descriptor.id}.trigger`;
    if (ids.has(triggerId)) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.eventTriggerCollision,
        `Event function "${descriptor.id}" reserves trigger ID "${triggerId}", but that ID is already declared.`,
        "error",
        undefined,
        `Rename the authored descriptor using "${triggerId}".`,
      );
    }
    return [descriptor, eventTrigger(descriptor, triggerId)];
  });
}

function eventTrigger(descriptor: NormalizedDescriptor, triggerId: string): NormalizedDescriptor {
  const value = descriptor.value as Record<string, unknown>;
  return {
    kind: "event-trigger",
    id: triggerId,
    source: descriptor.source,
    exportName: `<generated:${descriptor.exportName}>`,
    exportKind: "named",
    value: {
      id: triggerId,
      ref: { kind: "event-trigger", id: triggerId },
      target: { ref: { kind: "function", id: descriptor.id } },
      eventId: value.event,
      delivery: value.delivery,
      profile: value.profile,
      retry: value.retry,
      concurrency: value.concurrency,
      timeoutMs: value.timeoutMs,
      generated: {
        generated: true,
        generatedBy: "event-function",
        functionId: descriptor.id,
      },
    },
  };
}
