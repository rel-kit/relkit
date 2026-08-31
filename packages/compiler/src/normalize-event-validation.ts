import { add } from "./normalize-pass-utils.js";
import { isRecord, refId } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

export function validateEventCompatibility(work: NormalizationWork): void {
  for (const descriptor of work.descriptors) {
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
    if (descriptor.kind === "function") validateEventFunction(work, descriptor);
    if (descriptor.kind === "event-trigger") validateEventTrigger(work, descriptor);
  }
}

function validateEventFunction(work: NormalizationWork, descriptor: NormalizedDescriptor): void {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  validatePublishes(work, descriptor, value.publishes);
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
}

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

export function validatePublishes(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  publishes: unknown,
): void {
  if (publishes === undefined) return;
  if (!Array.isArray(publishes)) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.publishes,
      `Function "${descriptor.id}" publishes must be an array.`,
    );
    return;
  }
  const seen = new Set<string>();
  for (const entry of publishes) {
    if (typeof entry !== "string" || !work.referencesByKind.get("event")?.has(entry)) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.publishes,
        `Function "${descriptor.id}" publishes unknown event "${String(entry)}".`,
        "error",
        undefined,
        "Use a registered event ID in publishes.",
      );
      continue;
    }
    if (seen.has(entry)) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.publishesDuplicate,
        `Function "${descriptor.id}" publishes event "${entry}" more than once.`,
        "error",
        undefined,
        `Remove the duplicate "${entry}" entry from publishes.`,
      );
    }
    seen.add(entry);
  }
}
