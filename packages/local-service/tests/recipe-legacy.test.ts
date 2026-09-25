import { Effect, Metric, Result } from "effect";
import { expect, test } from "vitest";
import {
  normalizeLocalServiceRecipe,
  normalizeLocalServiceRecipeEffect,
  type LocalServiceRecipe,
  type LocalServiceRecipeInput,
} from "../src/index.js";

const health = { command: ["true"], intervalMs: 100, timeoutMs: 100, retries: 2 };
const legacy: LocalServiceRecipe = {
  kind: "local-service-recipe",
  protocolVersion: 1,
  integrationId: "redis",
  recipeId: "redis-docker",
  recipeVersion: 1,
  materializerId: "docker",
  image: "redis",
  command: ["redis-server"],
  ports: { client: 6379 },
  volume: { mountPath: "/data" },
  health,
  generatedSecrets: { password: { bytes: 16, encoding: "hex" } },
  environment: { REDIS_PASSWORD: { secret: "password" } },
  outputs: ({ ports }) => ({ port: ports.client ?? 6379 }),
  initialize: async () => {},
};

test("normalizes a legacy recipe and preserves callback behavior", async () => {
  const normalized = normalizeLocalServiceRecipe(legacy);
  expect(normalized.recipeVersion).toBe(1);
  expect(normalized.units).toEqual([
    expect.objectContaining({
      id: "service",
      image: "redis",
      ports: { client: 6379 },
      volumes: [{ name: "data", mountPath: "/data" }],
    }),
  ]);
  expect(normalized.volumes).toEqual({ data: { mountPath: "/data" } });
  expect(normalized.environment).toEqual(legacy.environment);
  expect(normalized.outputs({ ports: { client: 6380 }, secrets: {} })).toEqual({ port: 6380 });
  await normalized.initialize?.({ ports: {}, secrets: {} });
  expect(Object.isFrozen(normalized)).toBe(true);
  expect(Object.isFrozen(normalized.units[0])).toBe(true);
});

test("normalizes a minimal legacy recipe without optional values", () => {
  const normalized = Effect.runSync(
    normalizeLocalServiceRecipeEffect({
      kind: "local-service-recipe",
      protocolVersion: 1,
      integrationId: "redis",
      recipeId: "minimal",
      recipeVersion: 1,
      materializerId: "docker",
      image: "redis",
      ports: {},
      health,
      outputs: () => ({}),
    }),
  );
  expect(normalized.volumes).toEqual({});
  expect(normalized.units[0]?.volumes).toEqual([]);
  expect(normalized.generatedSecrets).toEqual({});
  expect(normalized.environment).toEqual({});
});

test.each([
  ["protocol", { ...legacy, protocolVersion: 2 }, "Local-service recipe"],
  ["health", { ...legacy, health: { ...health, retries: 0 } }, "health check"],
  ["command", { ...legacy, command: ["bad\ncommand"] }, "unit command"],
  ["volume path", { ...legacy, volume: { mountPath: "../data" } }, "unit volume"],
  ["secret size", { ...legacy, generatedSecrets: { password: { bytes: 4 } } }, "generated secret"],
  [
    "secret reference",
    { ...legacy, environment: { REDIS_PASSWORD: { secret: "missing" } } },
    "secret environment",
  ],
])("rejects invalid legacy %s", (_name, candidate, message) => {
  const recipe = candidate as LocalServiceRecipeInput;
  const result = Effect.runSync(Effect.result(normalizeLocalServiceRecipeEffect(recipe)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.message).toContain(message);
  expect(() => normalizeLocalServiceRecipe(recipe)).toThrow(message);
});

test("recipe normalization records one success and one failure in live metrics", () => {
  const registry: Metric.MetricRegistry = new Map();
  const calls = Metric.withAttributes(
    Metric.counter("relkit_local_service_operations_total", { incremental: true }),
    { operation: "recipe.normalize" },
  );
  const failures = Metric.withAttributes(
    Metric.counter("relkit_local_service_failures_total", { incremental: true }),
    { operation: "recipe.normalize" },
  );
  const result = Effect.runSync(
    Effect.provideService(
      Effect.gen(function* () {
        yield* normalizeLocalServiceRecipeEffect(legacy);
        yield* Effect.result(normalizeLocalServiceRecipeEffect({ ...legacy, recipeId: "bad id" }));
        return {
          calls: (yield* Metric.value(calls)).count,
          failures: (yield* Metric.value(failures)).count,
        };
      }),
      Metric.MetricRegistry,
      registry,
    ),
  );
  expect(result).toEqual({ calls: 2, failures: 1 });
});
