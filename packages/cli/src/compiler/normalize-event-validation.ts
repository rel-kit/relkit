import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { add } from "./normalize-pass-utils.js";
import { isRecord, refId } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/**
 * Checks event targets and directional contract compatibility.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateEventCompatibilityEffect = Effect.fn("Compiler.validateEventCompatibility")(
  function* (work: NormalizationWork) {
    yield* Effect.forEach(
      work.descriptors,
      (descriptor) =>
        Effect.gen(function* () {
          if (descriptor.kind === "event" && isRecord(descriptor.value)) {
            for (const field of ["handler", "output"]) {
              if (Object.hasOwn(descriptor.value, field))
                add(
                  work,
                  descriptor,
                  NORMALIZE_CODES.descriptor,
                  `Event "${descriptor.id}" cannot declare ${field}; define an event contract and a separate defineEventFunction consumer.`,
                );
            }
          }
          if (descriptor.kind === "function") yield* validateEventFunctionEffect(work, descriptor);
          if (descriptor.kind === "event-trigger") validateEventTrigger(work, descriptor);
        }),
      { discard: true },
    );
  },
  (effect, work) =>
    observeCompiler("normalization", "validateEventCompatibility", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks event targets and directional contract compatibility.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateEventCompatibility(work: NormalizationWork): void {
  return runCompilerSync(validateEventCompatibilityEffect(work));
}

/**
 * Checks event-only function metadata against its event contract.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns A lazy effect updating diagnostics.
 */
const validateEventFunctionEffect = Effect.fnUntraced(function* (
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
) {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  if (value.invocationMode !== "event-only") return;
  const eventId = value.event;
  if (typeof eventId !== "string" || !work.referencesByKind.get("event")?.has(eventId)) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.eventName,
      `Event function "${descriptor.id}" references unknown event "${String(eventId)}".`,
      "error",
      undefined,
      "Declare the event with defineEvent or use a registered event ID.",
    );
  }
});

/**
 * Checks trigger target, event version, and input compatibility.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function validateEventTrigger(work: NormalizationWork, descriptor: NormalizedDescriptor): void {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const eventId = value.eventId;
  const event =
    typeof eventId === "string" ? work.referencesByKind.get("event")?.get(eventId) : undefined;
  if (event === undefined) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.eventName,
      `Event name "${String(eventId)}" is not registered.`,
    );
    return;
  }
  const eventValue = isRecord(event.value) ? event.value : {};
  value.eventVersion = eventValue.version;
  const targetId = refId(value.target);
  const target =
    targetId === undefined ? undefined : work.referencesByKind.get("function")?.get(targetId);
  const targetValue = isRecord(target?.value) ? target.value : {};
  if (target === undefined || targetValue.invocationMode !== "event-only") {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.eventTarget,
      `Event trigger "${descriptor.id}" must target an event-only function.`,
    );
  }
}
