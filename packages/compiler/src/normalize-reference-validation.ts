import { add, targetFields, validateDependencies } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { id, isRecord, refId, refKind } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { validateRateLimitStore } from "./normalize-rate-limit.js";

const SERVICE_OWNERSHIP_CODE = "ZSYS_SERVICE_OWNERSHIP";

/** Resolves descriptor, middleware, and named-transform references without importing code. */
export function passReferences(work: NormalizationWork): void {
  const serviceOwners = new Map<string, NormalizedDescriptor>();
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
    if (descriptor.kind === "service") validateService(work, descriptor, value, serviceOwners);
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
  owners: Map<string, NormalizedDescriptor>,
): void {
  const functions = isRecord(value.functions) ? value.functions : undefined;
  if (functions === undefined || Object.keys(functions).length === 0) {
    add(work, service, NORMALIZE_CODES.descriptor, "A service must declare at least one function.");
  } else {
    for (const target of Object.values(functions)) {
      const resolved = referenceFor(work, target, "function");
      if (resolved === undefined) {
        add(
          work,
          service,
          NORMALIZE_CODES.missingTarget,
          "Service member does not resolve to a function.",
        );
        continue;
      }
      const previous = owners.get(resolved.id);
      if (previous !== undefined && previous.id !== service.id) {
        add(
          work,
          service,
          SERVICE_OWNERSHIP_CODE,
          `Function "${resolved.id}" is already owned by service "${previous.id}".`,
          "error",
          previous,
        );
      } else {
        owners.set(resolved.id, service);
      }
    }
  }
  if (value.middleware === undefined) return;
  if (!Array.isArray(value.middleware)) {
    add(work, service, NORMALIZE_CODES.descriptor, "Service middleware must be an array.");
    return;
  }
  for (const entry of value.middleware) {
    if (refKind(entry) !== "service-middleware" || refId(entry) === undefined) {
      add(work, service, NORMALIZE_CODES.descriptor, "Service middleware reference is invalid.");
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
