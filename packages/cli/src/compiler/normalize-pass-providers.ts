import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { providerProfiles } from "./normalize-compat.js";
import { requestedProviderProfile, selectedProviderProfile } from "./normalize-graph-app.js";
import {
  validateProviderSingletonsEffect,
  validateProviderReleaseSourcesEffect,
  validateUniqueBucketProfilesEffect,
  validateProviderProfileEffect,
} from "./normalize-provider-validation.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

/**
 * Checks provider profiles, ownership, and release sources.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that checks provider profiles, ownership, and release sources; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const passProvidersEffect = Effect.fn("Compiler.passProviders")(
  function* (work: NormalizationWork) {
    yield* validateProviderSingletonsEffect(work);
    yield* validateProviderReleaseSourcesEffect(work);
    yield* validateUniqueBucketProfilesEffect(work);
    if (!work.descriptors.some((entry) => entry.kind === "app")) return;
    const profiles = providerProfiles({
      ...work.input,
      descriptors: work.descriptors.map((entry) => entry.value),
    });
    const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
    yield* Effect.forEach(
      work.descriptors,
      (descriptor) =>
        Effect.gen(function* () {
          const value = isRecord(descriptor.value) ? descriptor.value : {};
          const profileCapability =
            descriptor.kind === "agent" &&
            (value.execution === "graph" ||
              (value.model !== undefined && typeof value.model !== "string"))
              ? undefined
              : capabilityFor(descriptor.kind);
          if (profileCapability !== undefined) {
            const selected = selectedProviderProfile(
              application,
              profileCapability,
              requestedProviderProfile(descriptor.kind, value),
            );
            if (selected === undefined) {
              add(
                work,
                descriptor,
                NORMALIZE_CODES.providerProfile,
                `Unqualified ${profileCapability} use requires a default when multiple profiles exist.`,
              );
              return;
            }
            const capabilities = profiles.get(selected);
            if (capabilities === undefined || !capabilities.includes(profileCapability)) {
              add(
                work,
                descriptor,
                NORMALIZE_CODES.providerProfile,
                `Provider profile "${selected}" does not provide ${profileCapability}.`,
              );
            }
          }
          if (descriptor.kind === "agent" && value.client !== undefined) {
            yield* validateProviderProfileEffect(
              work,
              descriptor,
              profiles,
              application,
              "agent-state",
              value.stateProfile,
            );
          }
        }),
      { discard: true },
    );
  },
  (effect, work) =>
    observeCompiler("normalization", "passProviders", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks provider profiles, ownership, and release sources.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
export function passProviders(work: NormalizationWork): void {
  return runCompilerSync(passProvidersEffect(work));
}

/**
 * Maps a descriptor kind to its required provider capability.
 * @param kind - Descriptor or syntax category.
 * @returns The kind's provider capability, or undefined.
 */
function capabilityFor(kind: string): string | undefined {
  return (
    {
      bucket: "bucket",
      cache: "cache",
      job: "job",
      event: "event",
      "event-trigger": "event",
      agent: "model",
    } as Record<string, string>
  )[kind];
}
