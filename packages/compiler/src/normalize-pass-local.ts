import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { isRecord, method, path, positive } from "./normalize-utils.js";
import { add, isDescriptorLike, validateRetryEffect } from "./normalize-pass-utils.js";
import { validateJobEffect } from "./normalize-job-validation.js";
import { validateRateLimitEffect } from "./normalize-rate-limit.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { isMiddlewarePath } from "./middleware-coverage.js";
import { validateDomainsEffect } from "./normalize-domains.js";

/**
 * Checks individual descriptor shapes and source domain ownership.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks individual descriptor shapes and source domain ownership; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passLocalEffect = Effect.fn("Compiler.passLocal")(
  function* (work: NormalizationWork) {
    if (work.input.sources !== undefined) yield* validateDomainsEffect(work);
    yield* Effect.forEach(
      work.descriptors,
      (descriptor) =>
        Effect.gen(function* () {
          const value = isRecord(descriptor.value) ? descriptor.value : {};
          if (!isDescriptorLike(descriptor)) {
            add(
              work,
              descriptor,
              NORMALIZE_CODES.descriptor,
              "Exported value is not a RelKit descriptor.",
            );
            return;
          }
          if (descriptor.kind === "app") validateAppJobAliases(work, descriptor);
          if (descriptor.kind === "job") validateJobProfileAlias(work, descriptor);
          if (descriptor.kind === "route") {
            if (method(value.method) === undefined)
              add(work, descriptor, NORMALIZE_CODES.method, "HTTP method is invalid.");
            if (path(value.path) === undefined)
              add(work, descriptor, NORMALIZE_CODES.path, "HTTP path is invalid.");
            yield* validateRateLimitEffect(work, descriptor, value.rateLimit);
          }
          if (descriptor.kind === "middleware" && !isMiddlewarePath(value.path))
            add(work, descriptor, NORMALIZE_CODES.path, "Middleware path is invalid.");
          if (
            (descriptor.kind === "job" && !isRecord(value.task)) ||
            descriptor.kind === "event-trigger"
          )
            yield* validateRetryEffect(work, descriptor, value, descriptor.kind === "job");
          if (descriptor.kind === "job" && !isRecord(value.task))
            yield* validateJobEffect(work, descriptor, value);
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
            add(
              work,
              descriptor,
              NORMALIZE_CODES.descriptor,
              "Agent limits must be positive integers.",
            );
        }),
      { discard: true },
    );
  },
  (effect, work) =>
    observeCompiler("normalization", "passLocal", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks individual descriptor shapes and source domain ownership.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passLocal(work: NormalizationWork): void {
  return runCompilerSync(passLocalEffect(work));
}

/**
 * Checks deprecated job profile aliases and conflicting service selections.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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

/**
 * Checks legacy application job provider aliases and conflicting defaults.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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
