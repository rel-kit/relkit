import { schema } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { referenceFor } from "./normalize-reference-index.js";
import { isRecord, positive } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

const KEY_KINDS = new Set(["path", "query", "header", "cookie", "constant"]);

export function validateRateLimit(
  work: NormalizationWork,
  route: NormalizedDescriptor,
  value: unknown,
): void {
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
}

export function validateRateLimitStore(
  work: NormalizationWork,
  route: NormalizedDescriptor,
  value: unknown,
): void {
  if (!isRecord(value) || value.store === undefined) return;
  const cache = referenceFor(work, value.store, "cache");
  const cacheValue = isRecord(cache?.value) ? cache.value.value : undefined;
  const projected = schema(cacheValue).schema;
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
}
