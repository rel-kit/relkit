import { schema, schemaEntries } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { schemaKey } from "./normalize-utils.js";

export function passSchemas(work: NormalizationWork): void {
  const seen = new Set<unknown>();
  const descriptors = [
    ...work.descriptors,
    ...work.middlewareReferences.values(),
    ...work.transformReferences.values(),
  ];
  for (const descriptor of descriptors) {
    if (seen.has(descriptor.value)) continue;
    seen.add(descriptor.value);
    for (const [key, value] of schemaEntries(descriptor)) {
      validateSchema(work, descriptor, key, value);
    }
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    for (const field of requiredSchemaFields(descriptor.kind)) {
      if (value[field] === undefined)
        validateSchema(work, descriptor, schemaKey(descriptor.id, field), value[field]);
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
        job: ["input"],
        event: ["payload"],
        cache: ["key", "value"],
        agent: ["input", "output"],
      } as Readonly<Record<string, readonly string[]>>
    )[kind] ?? []
  );
}

function validateSchema(
  work: NormalizationWork,
  descriptor: NormalizationWork["descriptors"][number],
  key: string,
  value: unknown,
): void {
  const result = schema(value);
  if (!result.ok)
    add(
      work,
      descriptor,
      NORMALIZE_CODES.schema,
      `${key} cannot produce deterministic JSON Schema: ${result.reason ?? "unavailable"}.`,
    );
  else if (result.schema !== undefined) work.schemas.set(key, result.schema);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
