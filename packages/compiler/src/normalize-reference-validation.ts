import { add, targetFields, validateDependencies } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { id, isRecord, refId, refKind } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

/** Resolves descriptor, middleware, and named-transform references without importing code. */
export function passReferences(work: NormalizationWork): void {
  for (const descriptor of work.descriptors) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    for (const [name, kind] of targetFields(descriptor.kind)) {
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
    if (descriptor.kind === "route") validateRouteReferences(work, descriptor, value);
  }

  for (const middleware of work.middlewareReferences.values()) {
    const value = isRecord(middleware.value) ? middleware.value : {};
    if (referenceFor(work, value.target, "function") === undefined) {
      add(
        work,
        middleware,
        NORMALIZE_CODES.missingTarget,
        "Middleware target does not resolve to a function.",
      );
    }
    collectTransforms(work, middleware, value.request);
  }
  for (const descriptor of work.descriptors.filter((entry) => entry.kind === "transform")) {
    if (!work.transformReferences.has(descriptor.id)) {
      add(work, descriptor, NORMALIZE_CODES.missingTransform, "Named transform is not indexed.");
    }
  }
}

function validateRouteReferences(
  work: NormalizationWork,
  route: NormalizedDescriptor,
  value: Record<string, unknown>,
): void {
  const middleware = value.middleware;
  if (middleware === undefined) {
    collectTransforms(work, route, value.request);
    return;
  }
  if (!Array.isArray(middleware)) {
    add(work, route, NORMALIZE_CODES.missingMiddleware, "Route middleware must be an array.");
  } else {
    const seen = new Set<string>();
    for (const entry of middleware) {
      const middlewareId = id(refId(entry) ?? (isRecord(entry) ? entry.id : undefined));
      if (middlewareId === undefined || refKind(entry) !== "middleware") {
        add(
          work,
          route,
          NORMALIZE_CODES.missingMiddleware,
          "Route middleware reference is invalid.",
        );
        continue;
      }
      if (seen.has(middlewareId)) {
        add(
          work,
          route,
          NORMALIZE_CODES.duplicateId,
          `Route middleware "${middlewareId}" is repeated.`,
        );
      }
      seen.add(middlewareId);
      if (!work.middlewareReferences.has(middlewareId)) {
        add(
          work,
          route,
          NORMALIZE_CODES.missingMiddleware,
          `Middleware "${middlewareId}" is missing.`,
        );
      }
    }
  }
  collectTransforms(work, route, value.request);
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
