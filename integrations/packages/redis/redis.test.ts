import { describe, expect, test } from "bun:test";
import { createBindingValueRef } from "@relkit/provider";
import { redis } from "./src/index.ts";
import { localRecipe } from "./src/local-recipe/index.ts";

describe("Redis integration authoring", () => {
  test("keeps configured connection, behavior, features, and provenance separate", () => {
    const url = createBindingValueRef("CACHE_URL", "secret-string");
    const adapter = redis({ url, connectionTimeoutMs: 750 });

    expect(adapter).toMatchObject({
      kind: "provider-adapter",
      protocolVersion: 1,
      integration: { integrationId: "redis" },
      capability: { id: "cache" },
      adapterId: "redis",
      connectionContract: { fields: { url: { authoredValue: "fallback" } } },
      connection: { url },
      behavior: { value: { connectionTimeoutMs: 750 } },
      features: [{ id: "atomicIncrement" }],
      localRecipe: { integrationId: "redis", recipeId: "redis-docker", recipeVersion: 1 },
    });
    expect(Object.isFrozen(adapter)).toBe(true);
  });

  test("supports a deferred form and rejects unsafe connection values", () => {
    expect(redis()).toMatchObject({ connection: {}, behavior: { value: {} } });
    expect(() => redis({ connectionTimeoutMs: 0 })).toThrow(
      "Redis connectionTimeoutMs must be a positive integer",
    );
    expect(() => redis({ url: createBindingValueRef("CACHE_URL", "string") as never })).toThrow(
      "Redis url must be a named secret binding value",
    );
    expect(() => redis({ typo: true } as never)).toThrow('Unknown Redis option "typo"');
  });
});

test("owns a pinned persistent Redis Docker recipe", () => {
  expect(Object.isFrozen(localRecipe)).toBe(true);
  expect(localRecipe).toMatchObject({
    kind: "local-service-recipe",
    protocolVersion: 1,
    integrationId: "redis",
    recipeId: "redis-docker",
    recipeVersion: 1,
    materializerId: "docker",
    image: expect.stringMatching(/^redis:7\.4\.2-alpine@sha256:[a-f0-9]{64}$/),
    command: ["redis-server", "--appendonly", "yes"],
    ports: { redis: 6379 },
    volume: { mountPath: "/data" },
    health: { command: ["redis-cli", "PING"] },
  });
  expect(localRecipe.outputs({ ports: { redis: 49_153 }, secrets: {} })).toEqual({
    url: "redis://127.0.0.1:49153",
  });
});
