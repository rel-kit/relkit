import { expect, test } from "bun:test";
import {
  ProviderProfileSelectionError,
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  normalizeProviderProfiles,
  selectProviderProfile,
} from "./src/index.ts";

const cache = defineProviderCapability("cache");
const redis = (url: string) =>
  defineProviderAdapter({
    integration: defineIntegrationReference("redis"),
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: {} }),
    connection: { url },
    behavior: defineProviderBehavior({}),
  });

test("normalizes direct bindings to default and selects a sole profile", () => {
  const normalized = normalizeProviderProfiles(cache, redis("redis://default"));
  expect(Object.keys(normalized.profiles)).toEqual(["default"]);
  expect(selectProviderProfile(normalized, { descriptorId: "cart" })).toMatchObject({
    capability: "cache",
    profile: "default",
    source: "sole",
  });
  expect(Object.isFrozen(normalized.profiles.default)).toBe(true);
});

test("selects descriptor, then application default, before sole-profile inference", () => {
  const normalized = normalizeProviderProfiles(cache, {
    timeline: redis("redis://timeline"),
    requests: redis("redis://requests"),
  });
  expect(Object.keys(normalized.profiles)).toEqual(["requests", "timeline"]);
  expect(
    selectProviderProfile(normalized, {
      descriptorId: "feed",
      profile: "timeline",
      defaultProfile: "requests",
    }),
  ).toMatchObject({ profile: "timeline", source: "descriptor" });
  expect(
    selectProviderProfile(normalized, { descriptorId: "feed", defaultProfile: "requests" }),
  ).toMatchObject({ profile: "requests", source: "default" });
});

test("reports ambiguous and unknown profiles with logical descriptor context", () => {
  const normalized = normalizeProviderProfiles(cache, {
    requests: redis("redis://requests"),
    timeline: redis("redis://timeline"),
  });
  let error: unknown;
  try {
    selectProviderProfile(normalized, { descriptorId: "feed" });
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(ProviderProfileSelectionError);
  expect(error).toMatchObject({
    code: "AMBIGUOUS_PROVIDER_PROFILE",
    capability: "cache",
    descriptorId: "feed",
    profiles: ["requests", "timeline"],
  });
  expect(() =>
    selectProviderProfile(normalized, { descriptorId: "feed", profile: "missing" }),
  ).toThrow(
    'cache logical descriptor "feed" selected unknown profile "missing"; available profiles: requests, timeline',
  );
});

test("rejects capability mismatches inside profile maps", () => {
  const bucket = defineProviderCapability("bucket");
  expect(() => normalizeProviderProfiles(bucket, { primary: redis("redis://cache") })).toThrow(
    'bucket provider profile "primary" received cache.redis',
  );
});
