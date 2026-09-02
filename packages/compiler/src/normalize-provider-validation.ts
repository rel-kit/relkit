import { add } from "./normalize-pass-utils.js";
import { providerMaps } from "./normalize-graph-app.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";

export function validateProviderSingletons(work: NormalizationWork): void {
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
}

export function validateProviderReleaseSources(work: NormalizationWork): void {
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
}

export function validateUniqueBucketProfiles(work: NormalizationWork): void {
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
}
