import { expect, test } from "bun:test";
import {
  ProviderFeatureMismatchError,
  defineConnectionContract,
  defineInfrastructureProviderSource,
  defineIntegrationReference,
  defineLocalRecipeReference,
  defineProviderAccess,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  defineProviderFeature,
  normalizeProviderBinding,
  normalizeProviderProfiles,
  selectProviderProfile,
} from "./src/index.ts";

const cache = defineProviderCapability("cache");
const redis = defineIntegrationReference("redis");

test("validates features and keeps access separate from adapter behavior", () => {
  const adapter = defineProviderAdapter({
    integration: redis,
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: {} }),
    connection: {},
    behavior: defineProviderBehavior({ access: { accidental: true }, keyPrefix: "commerce" }),
    features: [defineProviderFeature(cache, "atomicIncrement")],
    localRecipe: defineLocalRecipeReference(redis, "redis-docker", 1),
  });
  const source = defineInfrastructureProviderSource(
    adapter,
    defineIntegrationReference("aws"),
    {},
    defineProviderAccess({ actions: ["elasticache:Connect"] }),
  );
  const profiles = normalizeProviderProfiles(cache, { requests: source });
  const selection = selectProviderProfile(profiles, { descriptorId: "cart" });
  const binding = normalizeProviderBinding(selection, {
    descriptorId: "cart",
    requiredFeatures: ["atomicIncrement"],
  });

  expect(binding).toMatchObject({
    capability: "cache",
    profile: "requests",
    adapter: {
      integrationId: "redis",
      adapterId: "redis",
      behavior: { access: { accidental: true }, keyPrefix: "commerce" },
      features: ["atomicIncrement"],
    },
    access: { actions: ["elasticache:Connect"] },
  });
  expect(binding.access).not.toEqual(binding.adapter.behavior);
  expect(Object.isFrozen(binding)).toBe(true);
});

test("reports logical resource, profile, and every missing feature", () => {
  const adapter = defineProviderAdapter({
    integration: redis,
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: {} }),
    connection: { url: "redis://cache" },
    behavior: defineProviderBehavior({}),
  });
  const selection = selectProviderProfile(normalizeProviderProfiles(cache, adapter), {
    descriptorId: "cart",
  });
  let error: unknown;
  try {
    normalizeProviderBinding(selection, {
      descriptorId: "cart",
      requiredFeatures: ["atomicIncrement", "compareAndSet"],
    });
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(ProviderFeatureMismatchError);
  expect(error).toMatchObject({
    capability: "cache",
    profile: "default",
    descriptorId: "cart",
    features: ["atomicIncrement", "compareAndSet"],
  });
});
