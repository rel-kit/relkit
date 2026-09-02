import { expect, test } from "bun:test";
import type { ProviderBindingNode } from "@relkit/graph";
import { resolveProviderBindingConfiguration } from "./src/provider-binding-resolution.ts";

test("keeps local provider values scoped by binding and outside application environment", () => {
  const applicationEnvironment = Object.freeze({ CACHE_URL: "handler-visible" });
  const values = Object.freeze({ CACHE_URL: "redis://pipeline" });
  const local = Object.freeze({
    "provider.cache.requests": Object.freeze({ url: "redis://requests" }),
    "provider.cache.timeline": Object.freeze({ url: "redis://timeline" }),
  });

  expect(resolveProviderBindingConfiguration(binding("requests"), { values, local })).toEqual({
    behavior: { connectionTimeoutMs: 250 },
    connection: { url: "redis://requests" },
  });
  expect(resolveProviderBindingConfiguration(binding("timeline"), { values, local })).toEqual({
    behavior: { connectionTimeoutMs: 250 },
    connection: { url: "redis://timeline" },
  });
  expect(applicationEnvironment).toEqual({ CACHE_URL: "handler-visible" });
  expect(values).toEqual({ CACHE_URL: "redis://pipeline" });
});

test("does not use handler environment as a binding-value fallback", () => {
  const handlerEnvironment = { CACHE_URL: "redis://handler" };
  expect(() => resolveProviderBindingConfiguration(binding("requests"))).toThrow(
    'provider.cache.requests connection field "url" requires binding value "CACHE_URL"',
  );
  expect(handlerEnvironment).toEqual({ CACHE_URL: "redis://handler" });
});

function binding(profile: string): ProviderBindingNode {
  return {
    kind: "provider",
    id: `provider.cache.${profile}`,
    source: { file: "src/app.ts", line: 1, column: 1 },
    capability: "cache",
    profile,
    adapter: {
      integrationId: "redis",
      adapterId: "redis",
      protocolVersion: 1,
      behavior: { connectionTimeoutMs: 250 },
      connectionContract: {
        url: {
          required: true,
          sensitive: true,
          authoredValue: "fallback",
        },
      },
      connection: {},
      features: ["atomic-increment"],
    },
    providerSource: { kind: "connected" },
    namedValues: [
      {
        field: "url",
        name: "CACHE_URL",
        type: "secret-string",
        sensitive: true,
      },
    ],
    deploymentRoles: [],
  };
}
