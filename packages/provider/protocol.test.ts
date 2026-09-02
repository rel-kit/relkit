import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defineConnectionContract,
  defineIntegrationReference,
  defineInfrastructureProviderSource,
  defineLocalProviderSource,
  defineLocalRecipeReference,
  defineProviderAccess,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  normalizeProviderSource,
} from "./src/index.ts";

test("creates detached immutable provider protocol descriptors", () => {
  const options = { keyPrefix: "commerce" };
  const cache = defineProviderCapability("cache");
  const atomicIncrement = defineProviderFeature(cache, "atomicIncrement");
  const connectionContract = defineConnectionContract({
    url: { sensitive: true },
    timeoutMs: { required: false, authoredValue: "fallback", default: 1_000 },
  });
  const adapter = defineProviderAdapter({
    integration: defineIntegrationReference("redis"),
    capability: cache,
    adapterId: "redis",
    connectionContract,
    connection: { url: "redis://127.0.0.1:6379" },
    behavior: defineProviderBehavior(options),
    features: [atomicIncrement],
  });
  const access = defineProviderAccess({ actions: ["cache:read"] });

  options.keyPrefix = "changed";
  expect(adapter).toMatchObject({
    kind: "provider-adapter",
    protocolVersion: 1,
    adapterId: "redis",
    behavior: { value: { keyPrefix: "commerce" } },
    features: [{ capability: "cache", id: "atomicIncrement" }],
  });
  expect(access).toEqual({ kind: "provider-access", value: { actions: ["cache:read"] } });
  expect(Object.isFrozen(adapter)).toBe(true);
  expect(Object.isFrozen(adapter.connection)).toBe(true);
  expect(Object.isFrozen(adapter.connectionContract.fields.timeoutMs?.default)).toBe(true);
  expect(Object.isFrozen(adapter.behavior.value)).toBe(true);
});

test("rejects invalid adapter fields and duplicate features", () => {
  const cache = defineProviderCapability("cache");
  const feature = defineProviderFeature(cache, "atomicIncrement");
  const base = {
    integration: defineIntegrationReference("redis"),
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: {} }),
    behavior: defineProviderBehavior({}),
  };

  expect(() => defineProviderAdapter({ ...base, connection: { endpoint: "localhost" } })).toThrow(
    'Unknown connection field "endpoint"',
  );
  expect(() =>
    defineProviderAdapter({ ...base, connection: {}, features: [feature, feature] }),
  ).toThrow("Duplicate provider feature");
});

test("normalizes connected, local-only, local-overlay, and infrastructure sources", () => {
  const redis = defineIntegrationReference("redis");
  const cache = defineProviderCapability("cache");
  const connectionContract = defineConnectionContract({ url: { sensitive: true } });
  const localRecipe = defineLocalRecipeReference(redis, "redis-docker", 1);
  const adapter = (connection: Readonly<Record<string, string>>) =>
    defineProviderAdapter({
      integration: redis,
      capability: cache,
      adapterId: "redis",
      connectionContract,
      connection,
      behavior: defineProviderBehavior({}),
      localRecipe,
    });
  const configured = adapter({ url: "redis://cache.example" });
  const deferred = adapter({});

  expect(normalizeProviderSource(configured)).toMatchObject({ source: { kind: "connected" } });
  expect(normalizeProviderSource(defineLocalProviderSource(deferred))).toMatchObject({
    source: { kind: "local-only" },
    local: localRecipe,
  });
  expect(normalizeProviderSource(defineLocalProviderSource(configured))).toMatchObject({
    source: { kind: "connected" },
    local: localRecipe,
  });
  const infrastructure = defineInfrastructureProviderSource(
    deferred,
    defineIntegrationReference("aws"),
    { versioning: true },
    defineProviderAccess({ actions: ["s3:GetObject"] }),
  );
  const normalized = normalizeProviderSource(infrastructure);
  expect(normalized).toMatchObject({
    source: { kind: "infrastructure", integrationId: "aws", options: { versioning: true } },
    local: localRecipe,
    access: { actions: ["s3:GetObject"] },
  });
  expect(Object.isFrozen(normalized)).toBe(true);
  expect(Object.isFrozen(normalized.source)).toBe(true);
});

test("rejects unconfigured plain adapters and nested source wrappers", () => {
  const redis = defineIntegrationReference("redis");
  const deferred = defineProviderAdapter({
    integration: redis,
    capability: defineProviderCapability("cache"),
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: {} }),
    connection: {},
    behavior: defineProviderBehavior({}),
    localRecipe: defineLocalRecipeReference(redis, "redis-docker", 1),
  });
  const infrastructure = defineInfrastructureProviderSource(
    deferred,
    defineIntegrationReference("aws"),
    {},
  );
  const unsafeLocal = defineLocalProviderSource as (value: unknown) => unknown;

  expect(() => normalizeProviderSource(deferred)).toThrow(
    "cache.redis is missing connection fields: url",
  );
  expect(() => unsafeLocal(infrastructure)).toThrow("Provider source wrappers cannot be nested");
});

test("rejects a previous provider protocol without adapting it", () => {
  expect(() =>
    normalizeProviderSource({ kind: "provider-adapter", protocolVersion: 0 } as never),
  ).toThrow("Provider protocol version 0 is unsupported");
});

test("keeps provider declaration and normalization code free of I/O", () => {
  for (const source of [
    "protocol-builders.ts",
    "source-normalization.ts",
    "profile-normalization.ts",
    "binding-normalization.ts",
    "binding-resolution.ts",
  ]) {
    const contents = readFileSync(join(import.meta.dir, "src", source), "utf8");
    expect(contents).not.toMatch(/node:(?:fs|process)|\b(?:process|Bun\.file|readFile)\b/);
  }
});
