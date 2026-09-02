import { expect, test } from "bun:test";
import {
  ProviderBindingResolutionError,
  createBindingValueRef,
  defineConnectionContract,
  defineIntegrationReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  resolveProviderConnection,
} from "./src/index.ts";

const cache = defineProviderCapability("cache");
const integration = defineIntegrationReference("redis");

test("resolves local, infrastructure, named, fallback, and default values in order", () => {
  const adapter = defineProviderAdapter({
    integration,
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract({
      url: { authoredValue: "fallback", sensitive: true },
      timeoutMs: { authoredValue: "fallback" },
      tls: { required: false, default: true },
    }),
    connection: {
      url: createBindingValueRef("CACHE_URL", "secret-string"),
      timeoutMs: 500,
    },
    behavior: defineProviderBehavior({}),
  });

  expect(
    resolveProviderConnection(adapter, {
      profile: "requests",
      local: { url: "redis://local" },
      infrastructure: { url: "redis://infrastructure" },
      values: { CACHE_URL: "redis://runtime" },
    }),
  ).toEqual({ url: "redis://local", timeoutMs: 500, tls: true });
  expect(
    resolveProviderConnection(adapter, {
      profile: "requests",
      infrastructure: { url: "redis://infrastructure" },
      values: { CACHE_URL: "redis://runtime" },
    }).url,
  ).toBe("redis://infrastructure");
  const named = resolveProviderConnection(adapter, {
    profile: "requests",
    values: { CACHE_URL: "redis://runtime" },
  });
  expect(named).toEqual({ url: "redis://runtime", timeoutMs: 500, tls: true });
  expect(Object.isFrozen(named)).toBe(true);
});

test("rejects authoritative conflicts and reports missing names without values", () => {
  const adapter = defineProviderAdapter({
    integration,
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: { sensitive: true } }),
    connection: { url: createBindingValueRef("CACHE_URL", "secret-string") },
    behavior: defineProviderBehavior({}),
  });

  expect(() =>
    resolveProviderConnection(adapter, {
      profile: "requests",
      infrastructure: { url: "synthetic-secret-output" },
    }),
  ).toThrow('cache.requests connection field "url" conflicts with infrastructure output');
  let error: unknown;
  try {
    resolveProviderConnection(adapter, { profile: "requests" });
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(ProviderBindingResolutionError);
  expect(error).toMatchObject({
    code: "MISSING_CONNECTION_VALUE",
    bindingId: "cache.requests",
    field: "url",
  });
  expect(String(error)).toContain('requires binding value "CACHE_URL"');
  expect(String(error)).not.toContain("synthetic-secret-output");
});

test("rejects outputs for undeclared connection fields", () => {
  const adapter = defineProviderAdapter({
    integration,
    capability: cache,
    adapterId: "redis",
    connectionContract: defineConnectionContract({ url: {} }),
    connection: {},
    behavior: defineProviderBehavior({}),
  });
  expect(() =>
    resolveProviderConnection(adapter, {
      profile: "default",
      local: { endpoint: "redis://local" },
    }),
  ).toThrow('cache.default connection field "endpoint" is not declared for local output');
});
