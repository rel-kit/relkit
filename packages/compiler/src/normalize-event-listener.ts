import type { JsonValue } from "@relkit/contracts";
import { add } from "./normalize-pass-utils.js";
import { isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

export interface GeneratedEventListenerMarker {
  readonly generated: true;
  readonly generatedBy: "event-listener";
  readonly listenerId: string;
  readonly functionId: string;
}

export function normalizeEventListeners(
  work: NormalizationWork,
  descriptors: readonly NormalizedDescriptor[],
): NormalizedDescriptor[] {
  const authored = descriptors.map((descriptor) => normalizeListener(work, descriptor));
  return [...authored, ...authored.flatMap(generatedFunction)];
}

export function generatedEventListenerMarker(listenerId: string): GeneratedEventListenerMarker {
  return {
    generated: true,
    generatedBy: "event-listener",
    listenerId,
    functionId: `relkit.event.${listenerId}.handler`,
  };
}

export function setEventListenerSchemas(
  work: NormalizationWork,
  trigger: NormalizedDescriptor,
  expansion: readonly string[],
): void {
  const value = isRecord(trigger.value) ? trigger.value : {};
  if (value.callback !== true) return;
  const target =
    isRecord(value.target) && isRecord(value.target.ref) ? value.target.ref.id : undefined;
  if (typeof target !== "string") return;
  const variants = expansion.flatMap((pair) => {
    const at = pair.lastIndexOf("@");
    const eventId = pair.slice(0, at);
    const version = Number(pair.slice(at + 1));
    const payload = work.schemas.get(`${eventId}:payload`);
    return payload === undefined ? [] : [eventEnvelopeSchema(eventId, version, payload)];
  });
  work.schemas.set(`${target}:input`, variants.length === 1 ? variants[0]! : { anyOf: variants });
  work.schemas.set(`${target}:output`, {});
}

function normalizeListener(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
): NormalizedDescriptor {
  if (descriptor.kind !== "event-trigger" || !isRecord(descriptor.value)) return descriptor;
  const value = { ...descriptor.value };
  if (value.callback !== true) return descriptor;
  let listenerId = descriptor.id;
  if (value.inferredId === true) {
    if (descriptor.exportKind !== "named") {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.eventListenerId,
        "Callback listeners need a named export when id is omitted.",
      );
    } else {
      listenerId = `${selectorStem(value.selector)}.${descriptor.exportName}`;
    }
  }
  const marker = generatedEventListenerMarker(listenerId);
  const target = isRecord(value.target) ? value.target : {};
  value.id = listenerId;
  value.ref = { kind: "event-trigger", id: listenerId };
  value.target = {
    ...target,
    id: marker.functionId,
    ref: { kind: "function", id: marker.functionId },
  };
  return {
    ...descriptor,
    id: listenerId,
    value,
    ...(descriptor.reference === undefined
      ? {}
      : { reference: { ...descriptor.reference, descriptorId: listenerId } }),
  };
}

function generatedFunction(descriptor: NormalizedDescriptor): readonly NormalizedDescriptor[] {
  if (descriptor.kind !== "event-trigger" || !isRecord(descriptor.value)) return [];
  if (descriptor.value.callback !== true || !isRecord(descriptor.value.target)) return [];
  const marker = generatedEventListenerMarker(descriptor.id);
  return [
    {
      kind: "function",
      id: marker.functionId,
      source: descriptor.source,
      exportName: `<generated:${descriptor.exportName}>`,
      exportKind: "named",
      ...(descriptor.reference === undefined ? {} : { reference: descriptor.reference }),
      value: { ...descriptor.value.target, generated: marker },
    },
  ];
}

function selectorStem(selector: unknown): string {
  if (isRecord(selector) && selector.kind === "single" && isRecord(selector.event)) {
    return typeof selector.event.eventId === "string" ? selector.event.eventId : "events";
  }
  if (isRecord(selector) && selector.kind === "match") return "events.match";
  if (isRecord(selector) && selector.kind === "all") return "events.all";
  return "events.any";
}

function eventEnvelopeSchema(eventId: string, version: number, payload: JsonValue): JsonValue {
  return {
    type: "object",
    properties: {
      instanceId: { type: "string" },
      eventId: { const: eventId },
      version: { const: version },
      payload,
      occurredAt: { type: "string" },
      publishedAt: { type: "string" },
      key: { type: "string" },
      correlationId: { type: "string" },
      causationInvocationId: { type: "string" },
      traceId: { type: "string" },
      attributes: { type: "object", additionalProperties: true },
    },
    required: [
      "instanceId",
      "eventId",
      "version",
      "payload",
      "occurredAt",
      "publishedAt",
      "traceId",
      "attributes",
    ],
    additionalProperties: false,
  };
}
