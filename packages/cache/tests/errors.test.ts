import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  CacheCapabilityError,
  CacheDependencyError,
  CacheIncrementUnsupportedError,
  CacheOperationCancelledError,
  CacheOperationTimeoutError,
  CacheProviderError,
  CacheProviderFailureError,
  CacheSchemaValidationError,
  CacheTtlPolicyError,
  CacheValidationError,
} from "../src/client.js";
describe("cache tagged errors", () => {
  test("keeps public codes, names, and messages", () => {
    const cases = [
      [
        new CacheCapabilityError("increment", "increment"),
        "RELKIT_CACHE_CAPABILITY_UNSUPPORTED",
        'Cache operation "increment" requires unsupported capability "increment"',
      ],
      [
        new CacheDependencyError("prices"),
        "RELKIT_CACHE_DEPENDENCY_UNDECLARED",
        'Cache dependency "prices" is not declared on this function',
      ],
      [
        new CacheProviderError("get"),
        "RELKIT_CACHE_PROVIDER_UNAVAILABLE",
        'Cache provider does not implement "get"',
      ],
      [
        new CacheSchemaValidationError("key", []),
        "RELKIT_CACHE_SCHEMA_VALIDATION",
        "Cache key validation failed",
      ],
      [new CacheTtlPolicyError("invalid TTL"), "RELKIT_CACHE_TTL_POLICY", "invalid TTL"],
      [
        new CacheIncrementUnsupportedError(),
        "RELKIT_CACHE_INCREMENT_UNSUPPORTED",
        "Cache increment requires a numeric value contract",
      ],
      [new CacheOperationCancelledError(), "ABORT_ERR", "Cache operation cancelled"],
      [new CacheOperationTimeoutError(), "ETIMEDOUT", "Cache operation timed out"],
    ] as const;
    for (const [error, code, message] of cases) {
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
      expect(error._tag).toContain("Cache");
    }
    expect(cases[6]?.[0].name).toBe("AbortError");
    expect(cases[7]?.[0].name).toBe("TimeoutError");
    expect(new CacheProviderFailureError({ operation: "get", cause: "offline" }).cause).toBe(
      "offline",
    );
    expect(new CacheValidationError({ reason: "bad" }).message).toBe("bad");
  });
  test("keeps native error classes recoverable by Effect tag", () => {
    const schema = new CacheSchemaValidationError("key", []);
    const ttl = new CacheTtlPolicyError("bad TTL");
    expect(schema).toBeInstanceOf(TypeError);
    expect(ttl).toBeInstanceOf(RangeError);
    expect(ttl.reason).toBe("bad TTL");
    expect(Effect.runSync(Effect.fail(schema).pipe(
      Effect.catchTag("CacheSchemaValidationError", (error) => Effect.succeed(error.phase)),
    ))).toBe("key");
    expect(Effect.runSync(Effect.fail(ttl).pipe(
      Effect.catchTag("CacheTtlPolicyError", (error) => Effect.succeed(error.message)),
    ))).toBe("bad TTL");
  });
});
