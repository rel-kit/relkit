import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { schemaEffect } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { isRecord, positive } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

const KEY_KINDS = new Set(["path", "query", "header", "cookie", "constant"]);

/**
 * Checks rate-limit policy syntax and positive bounds.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param route - Route whose coverage is selected.
 * @param value - Declared metadata to inspect without coercion.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateRateLimitEffect = Effect.fn("Compiler.validateRateLimit")(
  function* (work: NormalizationWork, route: NormalizedDescriptor, value: unknown) {
    if (value === undefined) return;
    if (
      !isRecord(value) ||
      !positive(value.limit) ||
      !positive(value.windowMs) ||
      !isRecord(value.key) ||
      !KEY_KINDS.has(String(value.key.kind))
    ) {
      add(work, route, NORMALIZE_CODES.rateLimit, "Route rate-limit policy is invalid.");
      return;
    }
    if (work.input.mode === "production" && value.store === undefined) {
      add(
        work,
        route,
        NORMALIZE_CODES.rateLimitStore,
        "Production rate limiting requires an explicit shared cache store.",
      );
    }
  },
  (effect, work, route, value) =>
    observeCompiler("normalization", "validateRateLimit", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks rate-limit policy syntax and positive bounds.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param route - Route whose coverage is selected.
 * @param value - Declared metadata to inspect without coercion.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateRateLimit(
  work: NormalizationWork,
  route: NormalizedDescriptor,
  value: unknown,
): void {
  return runCompilerSync(validateRateLimitEffect(work, route, value));
}

/**
 * Checks the selected provider for distributed rate-limit storage.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param route - Route whose coverage is selected.
 * @param value - Declared metadata to inspect without coercion.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const validateRateLimitStoreEffect = Effect.fn("Compiler.validateRateLimitStore")(
  function* (work: NormalizationWork, route: NormalizedDescriptor, value: unknown) {
    if (!isRecord(value) || value.store === undefined) return;
    const cache = referenceFor(work, value.store, "cache");
    const cacheValue = isRecord(cache?.value) ? cache.value.value : undefined;
    const projected = (yield* schemaEffect(cacheValue)).schema;
    const type =
      isRecord(projected) && !Array.isArray(projected)
        ? (projected as Record<string, unknown>)["type"]
        : undefined;
    if (cache === undefined || !["integer", "number"].includes(String(type))) {
      add(
        work,
        route,
        NORMALIZE_CODES.rateLimitReference,
        "Rate-limit store must resolve to a cache with numeric values.",
      );
    }
  },
  (effect, work, route, value) =>
    observeCompiler("normalization", "validateRateLimitStore", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Checks the selected provider for distributed rate-limit storage.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param route - Route whose coverage is selected.
 * @param value - Declared metadata to inspect without coercion.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function validateRateLimitStore(
  work: NormalizationWork,
  route: NormalizedDescriptor,
  value: unknown,
): void {
  return runCompilerSync(validateRateLimitStoreEffect(work, route, value));
}
