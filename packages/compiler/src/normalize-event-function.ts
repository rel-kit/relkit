import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { add } from "./normalize-pass-utils.js";
import { isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/**
 * Separates event-only functions from event trigger bindings.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptors - Ordered descriptors to normalize.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const normalizeEventFunctionsEffect = Effect.fn("Compiler.normalizeEventFunctions")(
  function* (work: NormalizationWork, descriptors: readonly NormalizedDescriptor[]) {
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
  },
  (effect, work, descriptors) =>
    observeCompiler("normalization", "normalizeEventFunctions", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Separates event-only functions from event trigger bindings.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptors - Ordered descriptors to normalize.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function normalizeEventFunctions(
  work: NormalizationWork,
  descriptors: readonly NormalizedDescriptor[],
): NormalizedDescriptor[] {
  return runCompilerSync(normalizeEventFunctionsEffect(work, descriptors));
}

/**
 * Builds the event trigger binding for an event-only function.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param triggerId - Stable identity assigned to the generated event trigger.
 * @returns The event trigger descriptor for the event-only function.
 */
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
