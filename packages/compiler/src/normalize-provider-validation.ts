import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { add } from "./normalize-pass-utils.js";
import { providerMaps, selectedProviderProfile } from "./normalize-graph-app.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/**
 * Checks singleton provider declarations across the application.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateProviderSingletonsEffect = Effect.fn("Compiler.validateProviderSingletons")(
  function* (work: NormalizationWork) {
    const apps = work.descriptors.filter((entry) => entry.kind === "app");
    for (const descriptor of apps.slice(1)) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.appDuplicate,
        "Exactly one application config may be exported.",
      );
    }
    const auth = work.descriptors.filter((entry) => {
      const value = isRecord(entry.value) ? entry.value : {};
      return entry.kind === "route" && isRecord(value.auth) && value.auth.kind === "better-auth";
    });
    for (const descriptor of auth.slice(1)) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.authDuplicate,
        "At most one Better Auth capability may be registered.",
      );
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "validateProviderSingletons", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks singleton provider declarations across the application.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateProviderSingletons(work: NormalizationWork): void {
  return runCompilerSync(validateProviderSingletonsEffect(work));
}

/**
 * Checks provider release source ownership.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateProviderReleaseSourcesEffect = Effect.fn(
  "Compiler.validateProviderReleaseSources",
)(
  function* (work: NormalizationWork) {
    if (work.input.mode !== "production") return;
    for (const descriptor of work.descriptors.filter((entry) => entry.kind === "app")) {
      const application = isRecord(descriptor.value) ? descriptor.value : {};
      for (const [capability, profiles] of providerMaps(application)) {
        if (!isRecord(profiles)) continue;
        for (const [profile, candidate] of Object.entries(profiles)) {
          if (
            !isRecord(candidate) ||
            !isRecord(candidate.source) ||
            candidate.source.kind !== "local-only"
          )
            continue;
          const bindingId = `provider.${capability}.${profile}`;
          add(
            work,
            descriptor,
            NORMALIZE_CODES.providerReleaseSource,
            `Provider binding "${bindingId}" is local-only; configure a connected or infrastructure release source.`,
          );
        }
      }
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "validateProviderReleaseSources", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks provider release source ownership.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateProviderReleaseSources(work: NormalizationWork): void {
  return runCompilerSync(validateProviderReleaseSourcesEffect(work));
}

/**
 * Checks bucket profile identity uniqueness.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateUniqueBucketProfilesEffect = Effect.fn(
  "Compiler.validateUniqueBucketProfiles",
)(
  function* (work: NormalizationWork) {
    const profiles = new Map<string, NormalizedDescriptor>();
    for (const descriptor of work.descriptors.filter((entry) => entry.kind === "bucket")) {
      const value = isRecord(descriptor.value) ? descriptor.value : {};
      const profile = typeof value.profile === "string" ? value.profile : "default";
      const previous = profiles.get(profile);
      if (previous === undefined) profiles.set(profile, descriptor);
      else {
        add(
          work,
          descriptor,
          NORMALIZE_CODES.bucketProfileDuplicate,
          `Bucket profile "${profile}" is already owned by "${previous.id}".`,
          "error",
          previous,
        );
      }
    }
  },
  (effect, work) =>
    observeCompiler("normalization", "validateUniqueBucketProfiles", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks bucket profile identity uniqueness.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateUniqueBucketProfiles(work: NormalizationWork): void {
  return runCompilerSync(validateUniqueBucketProfilesEffect(work));
}

/**
 * Checks a descriptor provider selection against declared profiles.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param profiles - Declared profiles for the validation.
 * @param application - Declared application for the validation.
 * @param capability - Required provider capability.
 * @param requested - Declared requested for the validation.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateProviderProfileEffect = Effect.fn("Compiler.validateProviderProfile")(
  function* (
    work: NormalizationWork,
    descriptor: NormalizedDescriptor,
    profiles: ReadonlyMap<string, readonly string[]>,
    application: unknown,
    capability: string,
    requested: unknown,
  ) {
    const selected = selectedProviderProfile(
      application,
      capability,
      typeof requested === "string" ? requested : undefined,
    );
    if (selected !== undefined && profiles.get(selected)?.includes(capability)) return;
    add(
      work,
      descriptor,
      NORMALIZE_CODES.providerProfile,
      `Provider profile ${JSON.stringify(selected ?? requested)} does not provide ${capability}.`,
    );
  },
  (effect, work, descriptor, profiles, application, capability, requested) =>
    observeCompiler("normalization", "validateProviderProfile", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks a descriptor provider selection against declared profiles.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param profiles - Declared profiles for the validation.
 * @param application - Declared application for the validation.
 * @param capability - Required provider capability.
 * @param requested - Declared requested for the validation.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateProviderProfile(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  profiles: ReadonlyMap<string, readonly string[]>,
  application: unknown,
  capability: string,
  requested: unknown,
): void {
  return runCompilerSync(
    validateProviderProfileEffect(work, descriptor, profiles, application, capability, requested),
  );
}
