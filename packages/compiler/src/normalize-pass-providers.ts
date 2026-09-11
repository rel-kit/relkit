import { providerProfiles } from "./normalize-compat.js";
import { requestedProviderProfile, selectedProviderProfile } from "./normalize-graph-app.js";
import {
  validateProviderReleaseSources,
  validateProviderProfile,
  validateProviderSingletons,
  validateUniqueBucketProfiles,
} from "./normalize-provider-validation.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export function passProviders(work: NormalizationWork): void {
  validateProviderSingletons(work);
  validateProviderReleaseSources(work);
  validateUniqueBucketProfiles(work);
  if (!work.descriptors.some((entry) => entry.kind === "app")) return;
  const profiles = providerProfiles({
    ...work.input,
    descriptors: work.descriptors.map((entry) => entry.value),
  });
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  for (const descriptor of work.descriptors) {
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
        continue;
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
      validateProviderProfile(
        work,
        descriptor,
        profiles,
        application,
        "agent-state",
        value.stateProfile,
      );
    }
  }
}

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
