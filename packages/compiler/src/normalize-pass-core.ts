import { extractDescriptors } from "./discovery/extract.js";
import {
  id,
  isRecord,
  locationFor,
  method,
  path,
  positive,
  profile,
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
import { bindRouteFile } from "./normalize-route-file.js";
import { inferRouteContract } from "./normalize-route-inference.js";
import { validateRateLimit } from "./normalize-rate-limit.js";
import { normalizeEventFunctions } from "./normalize-event-function.js";
import { normalizeSourceIdentities } from "./normalize-source-identities.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { normalizeSelector } from "./normalize-model-selection.js";
import { isMiddlewarePath } from "./middleware-coverage.js";
import { validateDomains } from "./normalize-domains.js";

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
      for (const key of ["profile"] as const) {
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
      if (descriptor.kind === "agent" && value.model !== undefined) {
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
}

export function passLocal(work: NormalizationWork): void {
  if (work.input.sources !== undefined) validateDomains(work);
  for (const descriptor of work.descriptors) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    if (!isDescriptorLike(descriptor)) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.descriptor,
        "Exported value is not a RelKit descriptor.",
      );
      continue;
    }
    if (descriptor.kind === "route") {
      if (method(value.method) === undefined)
        add(work, descriptor, NORMALIZE_CODES.method, "HTTP method is invalid.");
      if (path(value.path) === undefined)
        add(work, descriptor, NORMALIZE_CODES.path, "HTTP path is invalid.");
      validateRateLimit(work, descriptor, value.rateLimit);
    }
    if (descriptor.kind === "middleware" && !isMiddlewarePath(value.path)) {
      add(work, descriptor, NORMALIZE_CODES.path, "Middleware path is invalid.");
    }
    if (descriptor.kind === "job" || descriptor.kind === "event-trigger")
      validateRetry(work, descriptor, value, descriptor.kind === "job");
    if (descriptor.kind === "job") validateJob(work, descriptor, value);
    if (descriptor.kind === "function" && value.invocationMode === "event-only") {
      for (const field of ["input", "output", "tool", "trigger"] as const) {
        if (descriptor.exportFact?.factory?.options.includes(field)) {
          add(
            work,
            descriptor,
            NORMALIZE_CODES.eventFunctionOption,
            `Event function "${descriptor.id}" cannot declare ${field}.`,
            "error",
            undefined,
            `Remove ${field}; the event contract supplies input and successful output is void.`,
          );
        }
      }
    }
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

export { passIndex } from "./normalize-reference-index.js";
export { passReferences } from "./normalize-reference-validation.js";
