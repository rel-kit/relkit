import { extractDescriptors } from "./discovery/extract.js";
import { schema, schemaEntries } from "./normalize-compat.js";
import {
  id,
  isRecord,
  locationFor,
  method,
  path,
  positive,
  profile,
  schemaKey,
  text,
} from "./normalize-utils.js";
import {
  add,
  isDescriptorLike,
  normalizeRetry,
  normalizeSchedule,
  toDescriptor,
  validateRetry,
} from "./normalize-pass-utils.js";
import { validateJob } from "./normalize-job-validation.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";

export function passExtract(work: NormalizationWork): void {
  const input = work.input;
  const extracted =
    input.extracted ??
    (input.evaluator !== undefined
      ? extractDescriptors(input.evaluator, input)
      : input.modules !== undefined
        ? extractDescriptors(input.modules, input)
        : undefined);
  work.descriptors = (extracted ?? input.descriptors ?? []).map((entry, index) =>
    toDescriptor(entry, input, index),
  );
}

export function passSources(work: NormalizationWork): void {
  work.descriptors = work.descriptors.map((descriptor) => ({
    ...descriptor,
    source: locationFor(descriptor, work.input),
  }));
}

export function passNormalize(work: NormalizationWork): void {
  work.descriptors = work.descriptors.map((descriptor) => {
    const value = isRecord(descriptor.value) ? { ...descriptor.value } : {};
    const nextId = id(value.id ?? descriptor.id);
    if (nextId === undefined)
      add(work, descriptor, NORMALIZE_CODES.id, "Descriptor ID is not a valid stable ID.");
    value.id = nextId ?? descriptor.id;
    if (descriptor.kind === "route") {
      const nextMethod = method(value.method);
      const nextPath = path(value.path);
      if (nextMethod !== undefined) value.method = nextMethod;
      if (nextPath !== undefined) value.path = nextPath;
    }
    for (const key of ["profile", "modelProfile"] as const) {
      if (value[key] !== undefined) {
        const nextProfile = profile(value[key]);
        if (nextProfile === undefined) {
          add(
            work,
            descriptor,
            NORMALIZE_CODES.profile,
            `${key} is not a valid stable profile ID.`,
          );
          if (key === "profile") delete value[key];
          else value[key] = "";
        } else value[key] = nextProfile;
      }
    }
    if (isRecord(value.retry)) value.retry = normalizeRetry(value.retry);
    if (Array.isArray(value.schedule)) value.schedule = value.schedule.map(normalizeSchedule);
    if (isRecord(value.idempotency))
      value.idempotency = {
        ...value.idempotency,
        key: text(value.idempotency.key) ?? value.idempotency.key,
      };
    return { ...descriptor, id: nextId ?? descriptor.id, value };
  });
}

export function passLocal(work: NormalizationWork): void {
  for (const descriptor of work.descriptors) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    if (!isDescriptorLike(descriptor)) {
      add(work, descriptor, NORMALIZE_CODES.descriptor, "Exported value is not a ZSys descriptor.");
      continue;
    }
    if (descriptor.kind === "route") {
      if (method(value.method) === undefined)
        add(work, descriptor, NORMALIZE_CODES.method, "HTTP method is invalid.");
      if (path(value.path) === undefined)
        add(work, descriptor, NORMALIZE_CODES.path, "HTTP path is invalid.");
      if (!Array.isArray(value.responses) || value.responses.length === 0)
        add(work, descriptor, NORMALIZE_CODES.mapping, "Route must declare a response mapping.");
    }
    if (descriptor.kind === "job" || descriptor.kind === "event-trigger")
      validateRetry(work, descriptor, value, descriptor.kind === "job");
    if (descriptor.kind === "job") validateJob(work, descriptor, value);
    if (descriptor.kind === "event" && !positive(value.version))
      add(
        work,
        descriptor,
        NORMALIZE_CODES.descriptor,
        "Event version must be a positive integer.",
      );
    if (
      descriptor.kind === "agent" &&
      (!positive(value.limits?.maxSteps) ||
        !positive(value.limits?.maxToolCalls) ||
        !positive(value.limits?.timeoutMs))
    )
      add(work, descriptor, NORMALIZE_CODES.descriptor, "Agent limits must be positive integers.");
  }
}

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

export { passIndex } from "./normalize-reference-index.js";
export { passReferences } from "./normalize-reference-validation.js";
