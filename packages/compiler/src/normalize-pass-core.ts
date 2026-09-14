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
import { discoverTaskJobs } from "./jobs/discover.js";

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
    if (descriptor.kind === "app") validateAppJobAliases(work, descriptor);
    if (descriptor.kind === "job") validateJobProfileAlias(work, descriptor);
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
    if ((descriptor.kind === "job" && !isRecord(value.task)) || descriptor.kind === "event-trigger")
      validateRetry(work, descriptor, value, descriptor.kind === "job");
    if (descriptor.kind === "job" && !isRecord(value.task)) validateJob(work, descriptor, value);
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

function validateJobProfileAlias(
  work: NormalizationWork,
  descriptor: import("./normalize-types.js").NormalizedDescriptor,
): void {
  const factory = descriptor.exportFact?.factory;
  if (factory?.factory !== "defineJob") return;
  const options = factory.options;
  const hasProfile = options.includes("profile");
  if (!hasProfile) return;
  if (options.includes("service")) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.jobProfile,
      'defineJob cannot specify both "service" and deprecated "profile".',
    );
    return;
  }
  add(
    work,
    descriptor,
    NORMALIZE_CODES.jobProfile,
    'The "profile" job option is deprecated; use "service".',
    "warning",
  );
}

function validateAppJobAliases(
  work: NormalizationWork,
  descriptor: import("./normalize-types.js").NormalizedDescriptor,
): void {
  const factory = descriptor.exportFact?.factory;
  const paths = factory?.optionPaths ?? factory?.options ?? [];
  const has = (path: string): boolean => paths.includes(path);
  if (has("jobs") && has("job")) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appConfigAlias,
      'defineApp cannot specify both "jobs" and legacy "job" provider options.',
    );
  } else if (has("job")) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appLegacyAlias,
      'The singular "job" provider option is deprecated; use "jobs".',
      "warning",
    );
  }
  if (has("defaults.jobs") && has("defaults.job")) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appConfigAlias,
      'defineApp defaults cannot specify both "defaults.jobs" and legacy "defaults.job".',
    );
  } else if (has("defaults.job")) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appLegacyAlias,
      'The singular "defaults.job" option is deprecated; use "defaults.jobs".',
      "warning",
    );
  }
}

export { passIndex } from "./normalize-reference-index.js";
export { passReferences } from "./normalize-reference-validation.js";
