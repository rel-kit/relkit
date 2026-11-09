import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { isRecord, method, path, positive } from "./normalize-utils.js";
import { add, isDescriptorLike, validateRetryEffect } from "./normalize-pass-utils.js";
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
          if (descriptor.kind === "route") {
            if (method(value.method) === undefined)
              add(work, descriptor, NORMALIZE_CODES.method, "HTTP method is invalid.");
            if (path(value.path) === undefined)
              add(work, descriptor, NORMALIZE_CODES.path, "HTTP path is invalid.");
            yield* validateRateLimitEffect(work, descriptor, value.rateLimit);
          }
          if (descriptor.kind === "middleware" && !isMiddlewarePath(value.path))
            add(work, descriptor, NORMALIZE_CODES.path, "Middleware path is invalid.");
          if (descriptor.kind === "event-trigger")
            yield* validateRetryEffect(work, descriptor, value);
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
