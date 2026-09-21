import { extractDescriptors } from "./discovery/extract.js";
import { id, isRecord, locationFor, profile, text } from "./normalize-utils.js";
import {
  add,
  isDescriptorLike,
  normalizeRetry,
  normalizeSchedule,
  toDescriptor,
  validateRetry,
} from "./normalize-pass-utils.js";
import { bindRouteFile } from "./normalize-route-file.js";
import { inferRouteContract } from "./normalize-route-inference.js";
import { normalizeEventFunctions } from "./normalize-event-function.js";
import { normalizeSourceIdentities } from "./normalize-source-identities.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { normalizeSelector } from "./normalize-model-selection.js";
import { discoverTaskJobs } from "./jobs/discover.js";
export { passLocal } from "./normalize-pass-local.js";

export { passSchemas } from "./normalize-schema-validation.js";

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
  const prepared = work.descriptors.map((descriptor) => {
    const value = isRecord(descriptor.value) ? { ...descriptor.value } : {};
    if (descriptor.kind === "route") bindRouteFile(work, descriptor, value);
    return { ...descriptor, value };
  });
  const identified = normalizeSourceIdentities(work, prepared);
  work.descriptors = normalizeEventFunctions(
    work,
    identified.map((descriptor) => {
      const value = isRecord(descriptor.value) ? { ...descriptor.value } : {};
      const nextId = id(value.id ?? descriptor.id);
      if (nextId === undefined)
        add(work, descriptor, NORMALIZE_CODES.id, "Descriptor ID is not a valid stable ID.");
      value.id = nextId ?? descriptor.id;
      if (descriptor.kind === "route") inferRouteContract(work, descriptor, value);
      const profileKeys =
        descriptor.kind === "job" ? (["profile", "service"] as const) : (["profile"] as const);
      for (const key of profileKeys) {
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
      if (
        descriptor.kind === "agent" &&
        value.model !== undefined &&
        typeof value.model === "string"
      ) {
        const model = normalizeSelector(value.model);
        if (model === undefined) {
          add(work, descriptor, NORMALIZE_CODES.model, "Model selector is invalid.");
          delete value.model;
        } else value.model = model;
      }
      if (isRecord(value.retry)) value.retry = normalizeRetry(value.retry);
      if (Array.isArray(value.schedule)) value.schedule = value.schedule.map(normalizeSchedule);
      if (isRecord(value.idempotency))
        value.idempotency = {
          ...value.idempotency,
          key: text(value.idempotency.key) ?? value.idempotency.key,
        };
      return { ...descriptor, id: nextId ?? descriptor.id, value };
    }),
  );
  discoverTaskJobs(work);
}

export { passIndex } from "./normalize-reference-index.js";
export { passReferences } from "./normalize-reference-validation.js";
