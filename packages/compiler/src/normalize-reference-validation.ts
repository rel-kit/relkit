import { add, targetFields, validateDependencies } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { id, isRecord, refKind } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { validateRateLimitStore } from "./normalize-rate-limit.js";

/** Resolves descriptor, middleware, and named-transform references without importing code. */
export function passReferences(work: NormalizationWork): void {
  for (const descriptor of work.descriptors) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    for (const [name, kind] of targetFields(descriptor.kind)) {
      if (descriptor.kind === "route" && value.raw === true) continue;
      if (referenceFor(work, value[name], kind) === undefined) {
        add(
          work,
          descriptor,
          NORMALIZE_CODES.missingTarget,
          `${descriptor.kind} target ${name} does not resolve to a ${kind}.`,
        );
      }
    }
    if (descriptor.kind === "function") validateDependencies(work, descriptor, value.dependencies);
    if (descriptor.kind === "route") {
      collectTransforms(work, descriptor, value.request);
      validateRateLimitStore(work, descriptor, value.rateLimit);
    }
    if (descriptor.kind === "service") validateService(work, descriptor, value);
  }

  for (const descriptor of work.descriptors.filter((entry) => entry.kind === "transform")) {
    if (!work.transformReferences.has(descriptor.id)) {
      add(work, descriptor, NORMALIZE_CODES.missingTransform, "Named transform is not indexed.");
    }
  }
}

function validateService(
  work: NormalizationWork,
  service: NormalizedDescriptor,
  value: Record<string, unknown>,
): void {
  for (const target of Object.values(value)) {
    const kind = refKind(target);
    if (kind === "function" || kind === "event") {
      const resolved = referenceFor(work, target, kind);
      if (resolved === undefined) {
        add(
          work,
          service,
          NORMALIZE_CODES.missingTarget,
          `Service member does not resolve to a ${kind}.`,
        );
      }
    }
  }
}

function collectTransforms(
  work: NormalizationWork,
  owner: NormalizedDescriptor,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  if (value.kind === "transform") {
    const transformId = id(value.transformId);
    if (transformId === undefined || !work.transformReferences.has(transformId)) {
      add(
        work,
        owner,
        NORMALIZE_CODES.missingTransform,
        `Request transform "${String(value.transformId)}" is missing.`,
      );
    }
    collectTransforms(work, owner, value.value);
    return;
  }
  if (value.kind === "input" || value.kind === "nested") {
    if (isRecord(value.fields)) {
      for (const field of Object.values(value.fields)) collectTransforms(work, owner, field);
    }
    return;
  }
  if (value.kind === "optional" || value.kind === "default")
    collectTransforms(work, owner, value.value);
}
