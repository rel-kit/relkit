import { canonicalJson } from "@zsys/contracts";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { matchingEvents, schema, schemaEquivalent, selectorEntries } from "./normalize-compat.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/** Expands selectors and validates event target contracts before graph construction. */
export function validateEventCompatibility(work: NormalizationWork): void {
  for (const trigger of work.descriptors.filter((entry) => entry.kind === "event-trigger")) {
    const value = isRecord(trigger.value) ? trigger.value : {};
    const selector = value.selector;
    const expansion = expandSelector(work, trigger, selector);
    work.selectorExpansions.set(trigger.id, expansion);
    validateEventTarget(work, trigger, value.target, expansion);
  }
}

function expandSelector(
  work: NormalizationWork,
  trigger: NormalizedDescriptor,
  selector: unknown,
): readonly string[] {
  if (!isRecord(selector)) {
    add(work, trigger, NORMALIZE_CODES.selector, "Event selector is invalid.");
    return [];
  }
  if (selector.kind === "match") {
    if (!isPattern(selector.pattern)) {
      add(work, trigger, NORMALIZE_CODES.selector, "Event selector pattern is invalid.");
      return [];
    }
    const expansion = matchingEvents(selector.pattern, work.descriptors);
    if (expansion.length === 0) {
      add(
        work,
        trigger,
        NORMALIZE_CODES.selector,
        `Event selector "${selector.pattern}" matched no known event.`,
        "warning",
      );
    }
    return [...new Set(expansion)].sort();
  }
  if (selector.kind === "all") {
    const purpose = selector.purpose;
    if (purpose !== "audit" && purpose !== "telemetry" && purpose !== "development") {
      add(
        work,
        trigger,
        NORMALIZE_CODES.wildcard,
        "Raw all-event selectors require an audit, telemetry, or development purpose.",
      );
    } else {
      add(
        work,
        trigger,
        NORMALIZE_CODES.wildcard,
        `Raw all-event selector is restricted to ${purpose}.`,
        "warning",
      );
    }
    return [];
  }
  const entries = selectorEntries(selector);
  if (entries.length === 0) {
    add(work, trigger, NORMALIZE_CODES.selector, "Event selector has no entries.");
    return [];
  }
  for (const entry of entries) {
    const at = entry.lastIndexOf("@");
    const eventId = entry.slice(0, at);
    const version = Number(entry.slice(at + 1));
    const event = work.referencesByKind.get("event")?.get(eventId);
    const eventVersion = isRecord(event?.value) ? event.value.version : undefined;
    if (event === undefined || eventVersion !== version) {
      add(work, trigger, NORMALIZE_CODES.selector, `Event selector target "${entry}" is missing.`);
    }
  }
  return [...new Set(entries)].sort();
}

function validateEventTarget(
  work: NormalizationWork,
  trigger: NormalizedDescriptor,
  targetValue: unknown,
  expansion: readonly string[],
): void {
  if (refKind(targetValue) !== "function") {
    add(work, trigger, NORMALIZE_CODES.eventTarget, "Event trigger target must be a function.");
    return;
  }
  const target = referenceFor(work, targetValue, "function");
  const targetInput = isRecord(target?.value) ? target.value.input : undefined;
  if (targetInput === undefined || expansion.length === 0) return;
  for (const pair of expansion) {
    const at = pair.lastIndexOf("@");
    const eventId = pair.slice(0, at);
    const version = Number(pair.slice(at + 1));
    const event = work.referencesByKind.get("event")?.get(eventId);
    const payload = isRecord(event?.value) ? event.value.payload : undefined;
    if (
      payload !== undefined &&
      schema(targetInput).ok &&
      schema(payload).ok &&
      !eventTargetCompatible(targetInput, payload, eventId, version)
    ) {
      add(
        work,
        trigger,
        NORMALIZE_CODES.eventTarget,
        `Event target input is incompatible with "${pair}".`,
      );
    }
  }
}

function eventTargetCompatible(
  target: unknown,
  payload: unknown,
  eventId: string,
  version: number,
): boolean {
  if (schemaEquivalent(target, payload)) return true;
  const targetSchema = schema(target);
  const payloadSchema = schema(payload);
  if (!targetSchema.ok || payloadSchema.schema === undefined) return false;
  return schemaVariants(targetSchema.schema).some((variant) =>
    eventEnvelopeCompatible(variant, payloadSchema.schema, eventId, version),
  );
}

function eventEnvelopeCompatible(
  value: unknown,
  payload: unknown,
  eventId: string,
  version: number,
): boolean {
  if (!isRecord(value) || !isRecord(value.properties)) return false;
  const required = Array.isArray(value.required) ? value.required : [];
  const properties = value.properties;
  return (
    required.includes("eventId") &&
    required.includes("version") &&
    required.includes("payload") &&
    matchesLiteral(properties.eventId, eventId) &&
    matchesLiteral(properties.version, version) &&
    properties.payload !== undefined &&
    canonicalJson(properties.payload) === canonicalJson(payload)
  );
}

function schemaVariants(value: unknown): readonly unknown[] {
  return isRecord(value) && Array.isArray(value.anyOf) ? value.anyOf : [value];
}

function matchesLiteral(value: unknown, expected: string | number): boolean {
  return isRecord(value) && (value.const === undefined || value.const === expected);
}

function isPattern(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    value
      .split(".")
      .every((segment) => segment === "*" || segment === "**" || /^[A-Za-z0-9_-]+$/.test(segment))
  );
}
