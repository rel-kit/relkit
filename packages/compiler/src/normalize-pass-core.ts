import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { extractDescriptorsEffect } from "./discovery/extract.js";
import { DiscoverySourceReader, nodeSourceReader } from "./discovery/source-map-source.js";
import { id, isRecord, locationFor, profile, text } from "./normalize-utils.js";
import { add, normalizeRetry, normalizeSchedule, toDescriptor } from "./normalize-pass-utils.js";
import { bindRouteFileEffect } from "./normalize-route-file.js";
import { inferRouteContractEffect } from "./normalize-route-inference.js";
import { normalizeEventFunctionsEffect } from "./normalize-event-function.js";
import { normalizeSourceIdentitiesEffect } from "./normalize-source-identities.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { normalizeSelector } from "./normalize-model-selection.js";
import { discoverTaskJobsEffect } from "./jobs/discover.js";
export { passLocal, passLocalEffect } from "./normalize-pass-local.js";

export { passSchemas, passSchemasEffect } from "./normalize-schema-validation.js";

/**
 * Extracts descriptor values and evaluator source evidence into this compilation.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect extracting descriptor and source evidence; requires DiscoverySourceReader and preserves accessor defects.
 * @remarks Requires DiscoverySourceReader; caller source access is never overridden.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passExtractWithSourcesEffect = Effect.fn("Compiler.passExtract")(
  function* (work: NormalizationWork) {
    const input = work.input;
    const extracted =
      input.extracted ??
      (input.evaluator !== undefined
        ? yield* extractDescriptorsEffect(input.evaluator, input)
        : input.modules !== undefined
          ? yield* extractDescriptorsEffect(input.modules, input)
          : undefined);
    work.descriptors = (extracted ?? input.descriptors ?? []).map((entry, index) =>
      toDescriptor(entry, input, index),
    );
  },
  (effect, work) =>
    observeCompiler("normalization", "passExtract", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/** Provides native source access for the existing no-service extraction entrypoint. */
export const passExtractEffect = (work: NormalizationWork) =>
  passExtractWithSourcesEffect(work).pipe(
    Effect.provideService(DiscoverySourceReader, nodeSourceReader),
  );

/**
 * Extracts descriptor values and evaluator source evidence into this compilation.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passExtract(work: NormalizationWork): void {
  return runCompilerSync(passExtractEffect(work));
}

/**
 * Attaches portable source locations to extracted descriptors.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that attaches portable source locations to extracted descriptors; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passSourcesEffect = Effect.fn("Compiler.passSources")(
  function* (work: NormalizationWork) {
    work.descriptors = work.descriptors.map((descriptor) => ({
      ...descriptor,
      source: locationFor(descriptor, work.input),
    }));
  },
  (effect, work) =>
    observeCompiler("normalization", "passSources", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Attaches portable source locations to extracted descriptors.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passSources(work: NormalizationWork): void {
  return runCompilerSync(passSourcesEffect(work));
}

/**
 * Normalizes identities, route contracts, policies, and task-backed jobs.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that normalizes identities, route contracts, policies, and task-backed jobs; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passNormalizeEffect = Effect.fn("Compiler.passNormalize")(
  function* (work: NormalizationWork) {
    const prepared = yield* Effect.forEach(work.descriptors, (descriptor) =>
      Effect.gen(function* () {
        const value = isRecord(descriptor.value) ? { ...descriptor.value } : {};
        if (descriptor.kind === "route") yield* bindRouteFileEffect(work, descriptor, value);
        return { ...descriptor, value };
      }),
    );
    const identified = yield* normalizeSourceIdentitiesEffect(work, prepared);
    work.descriptors = yield* normalizeEventFunctionsEffect(
      work,
      yield* Effect.forEach(identified, (descriptor) =>
        Effect.gen(function* () {
          const value = isRecord(descriptor.value) ? { ...descriptor.value } : {};
          const nextId = id(value.id ?? descriptor.id);
          if (nextId === undefined)
            add(work, descriptor, NORMALIZE_CODES.id, "Descriptor ID is not a valid stable ID.");
          value.id = nextId ?? descriptor.id;
          if (descriptor.kind === "route") yield* inferRouteContractEffect(work, descriptor, value);
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
      ),
    );
    yield* discoverTaskJobsEffect(work);
  },
  (effect, work) =>
    observeCompiler("normalization", "passNormalize", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Normalizes identities, route contracts, policies, and task-backed jobs.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passNormalize(work: NormalizationWork): void {
  return runCompilerSync(passNormalizeEffect(work));
}

export { passIndex, passIndexEffect } from "./normalize-reference-index.js";
export { passReferences, passReferencesEffect } from "./normalize-reference-validation.js";
