import { schema, schemaEntries } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { schemaKey, taskSchemaKey } from "./normalize-utils.js";

export function passSchemas(work: NormalizationWork): void {
  const seen = new Set<unknown>();
  const descriptors = [...work.descriptors, ...work.transformReferences.values()];
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.value)) continue;
    seen.add(descriptor.value);
    for (const [key, value, direction] of schemaEntries(descriptor)) {
      validateSchema(work, descriptor, key, value, direction);
    }
    if (descriptor.kind === "task") validateTaskProjections(work, descriptor);
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    if (
      descriptor.kind === "function" &&
      value.invocationMode === "event-only" &&
      typeof value.event === "string"
    ) {
      const event = work.descriptors.find(
        (entry) => entry.kind === "event" && entry.id === value.event,
      );
      const eventValue = isRecord(event?.value) ? event.value : {};
      if (eventValue.input !== undefined) {
        validateSchema(work, descriptor, schemaKey(descriptor.id, "input"), eventValue.input);
      }
    }
    for (const field of requiredSchemaFields(descriptor.kind)) {
      if (descriptor.kind === "job" && isRecord(value.task)) continue;
      const candidate =
        descriptor.kind === "task" && field === "input"
          ? (value.inputWire ?? value.input)
          : value[field];
      if (value[field] === undefined)
        validateSchema(
          work,
          descriptor,
          descriptor.kind === "task"
            ? taskSchemaKey(descriptor.id, field, "output")
            : schemaKey(descriptor.id, field),
          candidate,
          descriptor.kind === "task" ? "output" : undefined,
        );
    }
    if (descriptor.kind === "transform")
      validateSchema(work, descriptor, `${descriptor.id}:transform`, value.schema);
    if (descriptor.kind === "route" && Array.isArray(value.responses)) {
      for (const response of value.responses) {
        if (isRecord(response) && response.schema !== undefined) {
          validateSchema(
            work,
            descriptor,
            `${descriptor.id}:response:${String(response.id)}`,
            response.schema,
          );
        }
      }
    }
  }
}

function requiredSchemaFields(kind: string): readonly string[] {
  return (
    (
      {
        function: ["input", "output"],
        task: ["input", "output"],
        job: ["input"],
        event: ["input"],
        cache: ["key", "value"],
        agent: ["input", "output"],
        channel: ["params"],
        error: ["data"],
      } as Readonly<Record<string, readonly string[]>>
    )[kind] ?? []
  );
}

function validateSchema(
  work: NormalizationWork,
  descriptor: NormalizationWork["descriptors"][number],
  key: string,
  value: unknown,
  direction: import("./normalize-schema-projection.js").SchemaDirection = "legacy",
): void {
  const result = schema(value, direction);
  if (!result.ok)
    add(
      work,
      descriptor,
      NORMALIZE_CODES.schema,
      `${key} cannot produce deterministic JSON Schema: ${result.reason ?? "unavailable"}.`,
    );
  else if (result.schema !== undefined) {
    work.schemas.set(key, result.schema);
    if (result.contractHash !== undefined) work.schemaHashes.set(key, result.contractHash);
  }
}

function validateTaskProjections(
  work: NormalizationWork,
  descriptor: NormalizationWork["descriptors"][number],
): void {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const input = schema(value.input, "input");
  const canonicalInput = schema(value.inputWire ?? value.input, "output");
  const output = schema(value.output, "output");
  if (input.transformed === true && value.inputWire === undefined) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.jobProjection,
      "Task input transforms require an identity-preserving inputWire schema.",
      "error",
      undefined,
      "Declare inputWire with equal input/output types and no transformation.",
    );
  }
  if (value.inputWire !== undefined && !canonicalInput.ok) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.jobProjection,
      "Task inputWire cannot produce a faithful canonical JSON Schema.",
    );
  }
  if (output.transformed === true) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.jobProjection,
      "Task output must validate canonical values without a transformation.",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
