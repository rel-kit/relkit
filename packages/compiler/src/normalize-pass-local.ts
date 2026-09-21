import { id, isRecord, method, path, positive, profile } from "./normalize-utils.js";
import { add, isDescriptorLike, normalizeRetry, validateRetry } from "./normalize-pass-utils.js";
import { validateJob } from "./normalize-job-validation.js";
import { validateRateLimit } from "./normalize-rate-limit.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { isMiddlewarePath } from "./middleware-coverage.js";
import { validateDomains } from "./normalize-domains.js";

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
    if (descriptor.kind === "middleware" && !isMiddlewarePath(value.path))
      add(work, descriptor, NORMALIZE_CODES.path, "Middleware path is invalid.");
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
  if (!options.includes("profile")) return;
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
  if (has("jobs") && has("job"))
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appConfigAlias,
      'defineApp cannot specify both "jobs" and legacy "job" provider options.',
    );
  else if (has("job"))
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appLegacyAlias,
      'The singular "job" provider option is deprecated; use "jobs".',
      "warning",
    );
  if (has("defaults.jobs") && has("defaults.job"))
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appConfigAlias,
      'defineApp defaults cannot specify both "defaults.jobs" and legacy "defaults.job".',
    );
  else if (has("defaults.job"))
    add(
      work,
      descriptor,
      NORMALIZE_CODES.appLegacyAlias,
      'The singular "defaults.job" option is deprecated; use "defaults.jobs".',
      "warning",
    );
}
