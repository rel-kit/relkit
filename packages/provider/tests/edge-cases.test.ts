import { expect, test } from "vitest";
import { Effect } from "effect";
import {
  createBindingValueRef,
  defineConnectionContract,
  defineInfrastructureProviderSource,
  defineIntegrationReference,
  defineLocalProviderSource,
  defineLocalRecipeReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  isBindingValueRef,
  normalizeProviderBinding,
  normalizeProviderProfiles,
  normalizeProviderProfilesEffect,
  normalizeProviderSource,
  resolveProviderConnection,
  selectProviderProfile,
} from "../src/index.js";
const cache = defineProviderCapability("cache");
const redis = defineIntegrationReference("redis");
const behavior = defineProviderBehavior({});
const recipe = defineLocalRecipeReference(redis, "redis-docker", 1);
function adapter(
  fields: Readonly<Record<string, Parameters<typeof defineConnectionContract>[0][string]>>,
  connection: Readonly<Record<string, string | ReturnType<typeof createBindingValueRef>>> = {},
  withRecipe = true,
) {
  return defineProviderAdapter({
    integration: redis,
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract(fields),
    connection,
    behavior,
    ...(withRecipe ? { localRecipe: recipe } : {}),
  });
}
test("rejects duplicate normalized fields and invalid recipe versions", () => {
  expect(() => defineConnectionContract({ " url ": {}, url: {} })).toThrow(
    'Duplicate connection field "url"',
  );
  expect(() => defineLocalRecipeReference(redis, "docker", 0)).toThrow(
    "Local recipe version must be a positive integer",
  );
  expect(() => defineLocalRecipeReference(redis, "docker", 1.5)).toThrow(
    "Local recipe version must be a positive integer",
  );
});

test("binding reference predicate works through its synchronous adapter", () => {
  expect(isBindingValueRef(createBindingValueRef("URL", "string"))).toBe(true);
  expect(isBindingValueRef({ kind: "binding-value-ref", name: "URL" })).toBe(false);
});
test("rejects mismatched feature capability and missing source recipes", () => {
  const bucket = defineProviderCapability("bucket");
  const feature = defineProviderFeature(bucket, "versioned");
  expect(() =>
    defineProviderAdapter({
      integration: redis,
      capability: cache,
      adapterId: "redis",
      connectionContract: defineConnectionContract({}),
      connection: {},
      behavior,
      features: [feature as never],
    }),
  ).toThrow('Provider feature capability must be "cache"');
  const bare = adapter({}, {}, false);
  expect(() => defineLocalProviderSource(bare)).toThrow("does not declare a local recipe");
  expect(() => defineInfrastructureProviderSource(bare, redis, {})).toThrow(
    "does not declare a default local recipe",
  );
});
test("rejects empty and duplicate normalized profile maps", () => {
  expect(() => normalizeProviderProfiles(cache, {})).toThrow(
    "cache provider profiles must not be empty",
  );
  expect(() =>
    normalizeProviderProfiles(cache, {
      " requests ": adapter({}),
      requests: adapter({}),
    }),
  ).toThrow('Duplicate cache provider profile "requests"');
});
test("rejects malformed source wrappers and unknown wrapper kinds", () => {
  const value = adapter({});
  expect(() => normalizeProviderSource(null as never)).toThrow(
    "Provider source wrappers cannot be nested",
  );
  expect(() => normalizeProviderSource({ kind: "other", adapter: value } as never)).toThrow(
    "Invalid provider source descriptor",
  );
  expect(() => normalizeProviderSource({ kind: "other", adapter: {} } as never)).toThrow(
    "Provider source wrappers cannot be nested",
  );
});
test("resolves optional, defaulted, and missing connection fields", () => {
  const named = createBindingValueRef("CACHE_URL", "string");
  const target = adapter(
    {
      named: { required: false },
      defaulted: { default: "fallback" },
      absent: { required: false },
    },
    { named },
  );
  expect(resolveProviderConnection(target, { profile: "default" })).toEqual({
    defaulted: "fallback",
  });
  const withNamedDefault = adapter({ named: { default: "fallback" } }, { named });
  expect(resolveProviderConnection(withNamedDefault, { profile: "default" })).toEqual({
    named: "fallback",
  });
  expect(() =>
    resolveProviderConnection(adapter({ required: {} }), { profile: "default" }),
  ).toThrow('connection field "required" is required');
});
test("keeps output order and checks both output sources", () => {
  const target = adapter({ b: {}, a: {} });
  expect(
    Object.keys(
      resolveProviderConnection(target, {
        profile: "default",
        local: { b: 2 },
        infrastructure: { a: 1 },
      }),
    ),
  ).toEqual(["a", "b"]);
  expect(() =>
    resolveProviderConnection(target, {
      profile: "default",
      infrastructure: { unknown: "secret" },
    }),
  ).toThrow("is not declared for infrastructure output");
  const fixed = adapter({ url: {} }, { url: "redis://authored" });
  expect(() =>
    resolveProviderConnection(fixed, {
      profile: "default",
      local: { url: "redis://local" },
    }),
  ).toThrow("conflicts with local output");
});
test("retains optional binding metadata and de-duplicates required features", () => {
  const source = defineInfrastructureProviderSource(adapter({}, {}, true), redis, {});
  const profiles = normalizeProviderProfiles(cache, source);
  const selection = selectProviderProfile(profiles, { descriptorId: "cart" });
  const binding = normalizeProviderBinding(selection, {
    descriptorId: "cart",
    requiredFeatures: [],
  });
  expect(binding.local).toEqual(recipe);
  expect(binding.access).toBeUndefined();
  expect(binding.source.kind).toBe("infrastructure");
  expect(() =>
    normalizeProviderBinding(selection, {
      descriptorId: "cart",
      requiredFeatures: ["missing", "missing"],
    }),
  ).toThrow("missing features");
  expect(
    Effect.runSync(
      Effect.catchTag(
        normalizeProviderProfilesEffect(cache, {}),
        "ProviderValidationError",
        (error) => Effect.succeed(error.code),
      ),
    ),
  ).toBe("INVALID_PROFILE");
});
