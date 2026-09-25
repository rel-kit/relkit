import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  LocalServiceValidationFailure,
  normalizeLocalServiceRecipe,
  normalizeLocalServiceRecipeEffect,
  type LocalServiceRecipeInput,
} from "../src/index.js";

const unit = { id: "api", kind: "container", image: "api" };
const recipe = {
  kind: "local-service-recipe",
  protocolVersion: 2,
  integrationId: "test",
  recipeId: "composite",
  recipeVersion: 2,
  materializerId: "docker",
  units: [unit],
  volumes: {},
  outputs: () => ({}),
};

test.each([
  ["null unit", { ...recipe, units: [null] }, "unit identity"],
  ["invalid unit kind", { ...recipe, units: [{ ...unit, kind: "other" }] }, "unit kind"],
  ["null dependencies", { ...recipe, units: [{ ...unit, dependsOn: null }] }, "unit dependency"],
  ["scalar dependencies", { ...recipe, units: [{ ...unit, dependsOn: "api" }] }, "unit dependency"],
  ["null ports", { ...recipe, units: [{ ...unit, ports: null }] }, "unit port"],
  ["array ports", { ...recipe, units: [{ ...unit, ports: [] }] }, "unit port"],
  ["null mounts", { ...recipe, units: [{ ...unit, volumes: null }] }, "unit volume"],
  ["object mounts", { ...recipe, units: [{ ...unit, volumes: {} }] }, "unit volume"],
  ["null mount", { ...recipe, units: [{ ...unit, volumes: [null] }] }, "unit volume"],
  ["null secrets", { ...recipe, generatedSecrets: null }, "generated secret"],
  ["array secrets", { ...recipe, generatedSecrets: [] }, "generated secret"],
  ["null environment", { ...recipe, environment: null }, "secret environment"],
  ["array environment", { ...recipe, environment: [] }, "secret environment"],
  ["array network", { ...recipe, network: [] }, "Local-service network"],
  ["missing outputs", { ...recipe, outputs: undefined }, "Local-service recipe"],
  ["invalid initialize", { ...recipe, initialize: true }, "Local-service recipe"],
])("rejects %s through the Effect and synchronous APIs", (_name, candidate, message) => {
  const input = candidate as LocalServiceRecipeInput;
  const result = Effect.runSync(Effect.result(normalizeLocalServiceRecipeEffect(input)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(LocalServiceValidationFailure);
    expect(result.failure.message).toContain(message);
  }
  expect(() => normalizeLocalServiceRecipe(input)).toThrow(TypeError);
  expect(() => normalizeLocalServiceRecipe(input)).toThrow(message);
});

test("rejects a null legacy volume with a tagged failure", () => {
  const input = {
    ...recipe,
    protocolVersion: 1,
    recipeVersion: 1,
    image: "api",
    ports: {},
    health: { command: ["true"], intervalMs: 1, timeoutMs: 1, retries: 1 },
    volume: null,
  } as unknown as LocalServiceRecipeInput;
  const result = Effect.runSync(Effect.result(normalizeLocalServiceRecipeEffect(input)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(LocalServiceValidationFailure);
    expect(result.failure.message).toBe("Local-service volume");
  }
  expect(() => normalizeLocalServiceRecipe(input)).toThrow("Local-service volume");
});
