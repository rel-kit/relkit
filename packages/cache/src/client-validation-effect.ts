import { Effect } from "effect";
import type { StandardIssue, StandardSchemaV1 } from "@relkit/schema";
import {
  CacheSchemaValidationError,
  CacheTtlPolicyError,
  CacheValidationError,
} from "./client-errors.js";
import type { CacheClientOptions, CacheOperationOptions } from "./client.types.js";
/** Validates client identity before a provider is acquired.
 * @param options - Candidate client configuration.
 * @returns Void or a tagged configuration error.
 * @example Effect.runSync(validateClientIdentityEffect({ ownerId: "orders", cacheId: "prices", source: {} }));
 */
export const validateClientIdentityEffect = Effect.fn("cache.validateClientIdentity")(
  function* (options: CacheClientOptions) {
    if (options === null || typeof options !== "object" || Array.isArray(options))
      return yield* new CacheValidationError({ reason: "Cache options must be an object" });
    yield* assertTextEffect(options.ownerId, "ownerId");
    yield* assertTextEffect(options.cacheId, "cacheId");
  },
);
/** Validates schemas and TTL policy after the provider source.
 * @param options - Client configuration with validated identity.
 * @returns Void or a tagged schema or TTL error.
 * @example Effect.runSync(validateClientPolicyEffect({ ownerId: "orders", cacheId: "prices", source: {} }));
 */
export const validateClientPolicyEffect = Effect.fn("cache.validateClientPolicy")(
  function* (options: CacheClientOptions) {
    yield* assertSchemaEffect(options.keySchema ?? options.key ?? options.descriptor?.key, "key");
    yield* assertSchemaEffect(options.valueSchema ?? options.value ?? options.descriptor?.value, "value");
    const defaultTtlMs = options.defaultTtlMs ?? options.descriptor?.defaultTtlMs;
    const maxTtlMs = options.maxTtlMs ?? options.descriptor?.maxTtlMs;
    yield* validatePolicyEffect(defaultTtlMs, "defaultTtlMs");
    yield* validatePolicyEffect(maxTtlMs, "maxTtlMs");
    if (defaultTtlMs !== undefined && maxTtlMs !== undefined && defaultTtlMs > maxTtlMs)
      return yield* Effect.fail(new CacheTtlPolicyError("Cache defaultTtlMs must not exceed maxTtlMs"));
  },
);
/** Validates a required human-readable cache identifier. */
function assertTextEffect(value: unknown, name: string) {
  return typeof value === "string" && value.trim() !== ""
    ? Effect.void
    : Effect.fail(new CacheValidationError({ reason: `Cache ${name} must be non-empty` }));
}
/** Validates an optional Standard Schema v1 instance. */
function assertSchemaEffect(value: StandardSchemaV1 | undefined, name: string) {
  if (value === undefined) return Effect.void;
  const standard = value["~standard"];
  return standard?.version === 1 && typeof standard.validate === "function"
    ? Effect.void
    : Effect.fail(new CacheValidationError({
        reason: `Cache ${name} must be a Standard Schema v1 validator`,
      }));
}
/** Validates a value through Standard Schema in the typed error channel.
 * @param schema - Optional validator.
 * @param value - Value to decode.
 * @param phase - Key or value boundary.
 * @returns Decoded value or a tagged schema error.
 * @example Effect.runPromise(validateSchemaEffect(undefined, "sku", "key"));
 */
export const validateSchemaEffect = Effect.fn("cache.validateSchema")(
  (schema: StandardSchemaV1 | undefined, value: unknown, phase: "key" | "value") =>
    Effect.gen(function* () {
      if (schema === undefined) return value;
      const result = yield* Effect.tryPromise({
        try: () => Promise.resolve(schema["~standard"].validate(value)),
        catch: () => new CacheSchemaValidationError(phase, [{ message: `Invalid cache ${phase}` }]),
      });
      if ("issues" in result && result.issues !== undefined)
        return yield* Effect.fail(new CacheSchemaValidationError(phase, freezeIssues(result.issues)));
      return result.value;
    }),
);
/** Normalizes a requested TTL against the configured policy.
 * @param value - Requested TTL.
 * @param defaultTtlMs - Optional default TTL.
 * @param maxTtlMs - Optional maximum TTL.
 * @returns Provider options or a tagged policy error.
 * @example Effect.runSync(normalizeTtlEffect(undefined, 1000, 5000));
 */
export const normalizeTtlEffect = Effect.fn("cache.normalizeTtl")(
  (value: unknown, defaultTtlMs: number | undefined, maxTtlMs: number | undefined) =>
    Effect.gen(function* () {
      const ttlMs = value === undefined ? defaultTtlMs : value;
      if (ttlMs === undefined) return undefined;
      if (typeof ttlMs !== "number" || !Number.isSafeInteger(ttlMs) || ttlMs <= 0)
        return yield* Effect.fail(new CacheTtlPolicyError("Cache ttlMs must be a positive integer"));
      if (maxTtlMs !== undefined && ttlMs > maxTtlMs)
        return yield* Effect.fail(new CacheTtlPolicyError("Cache ttlMs exceeds the configured maximum"));
      return { ttlMs } satisfies CacheOperationOptions;
    }),
);
/** Validates configured policy numbers.
 * @param value - Optional TTL.
 * @param name - Stable option name.
 * @returns Void or a tagged policy error.
 * @example Effect.runSync(validatePolicyEffect(1000, "defaultTtlMs"));
 */
export const validatePolicyEffect = Effect.fn("cache.validatePolicy")(function* (
  value: number | undefined,
  name: string,
) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0))
    return yield* Effect.fail(new CacheTtlPolicyError(`Cache ${name} must be a positive integer`));
});
/** Validates a provider has result.
 * @param value - Provider result.
 * @returns A boolean or a tagged validation error.
 * @example Effect.runSync(validateBooleanEffect(true));
 */
export const validateBooleanEffect = Effect.fn("cache.validateBoolean")(function* (value: unknown) {
  if (typeof value !== "boolean")
    return yield* new CacheValidationError({ reason: "Cache has must return a boolean" });
  return value;
});
/** Validates a finite increment delta.
 * @param value - Requested delta.
 * @returns A finite number or a tagged validation error.
 * @example Effect.runSync(validateIncrementDeltaEffect(2));
 */
export const validateIncrementDeltaEffect = Effect.fn("cache.validateIncrementDelta")(function* (
  value: unknown,
) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return yield* new CacheValidationError({
      reason: "Cache increment delta must be a finite number",
    });
  return value;
});
/** Copies schema issues so caller mutation cannot alter an emitted failure. */
function freezeIssues(issues: readonly StandardIssue[]): readonly StandardIssue[] {
  return Object.freeze(
    issues.map((issue) =>
      Object.freeze({
        message: issue.message,
        ...(issue.path === undefined ? {} : { path: Object.freeze([...issue.path]) }),
      }),
    ),
  );
}
