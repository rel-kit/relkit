import { Effect, Tracer } from "effect";
import { expect, test } from "vitest";
import {
  assertLocalServicePlanVersionEffect,
  assertLocalServiceStateVersionEffect,
  assertProviderOverrideStateVersionEffect,
  normalizeLocalServiceRecipeEffect,
  providerOverrideBindingValuesEffect,
} from "../src/index.js";
const hash = "sha256:" + "a".repeat(64);
const expected = { applicationId: "example", planHash: hash, generationId: "generation-1" };
const override = {
  version: 1,
  applicationId: "example",
  localProjectId: hash,
  planHash: hash,
  generationId: "generation-1",
  bindings: [],
};
const recipe = {
  kind: "local-service-recipe" as const,
  protocolVersion: 2 as const,
  integrationId: "test",
  recipeId: "test",
  recipeVersion: 2 as const,
  materializerId: "docker" as const,
  units: [{ id: "api", kind: "container" as const, image: "api" }],
  volumes: {},
  outputs: () => ({}),
};
test.each([
  ["LocalService.assertPlanVersion", () => assertLocalServicePlanVersionEffect({ version: 1 })],
  ["LocalService.assertStateVersion", () => assertLocalServiceStateVersionEffect({ version: 1 })],
  [
    "LocalService.assertOverrideVersion",
    () => assertProviderOverrideStateVersionEffect({ version: 1 }),
  ],
  [
    "LocalService.providerOverrideBindingValues",
    () => Effect.asVoid(providerOverrideBindingValuesEffect(override, expected)),
  ],
  [
    "LocalService.normalizeLocalServiceRecipe",
    () => Effect.asVoid(normalizeLocalServiceRecipeEffect(recipe)),
  ],
] as const)("traces the public %s Effect operation", (name, operation) => {
  const spans: string[] = [];
  const tracer = Tracer.make({
    span(options) {
      spans.push(options.name);
      return Tracer.nativeTracer.span(options);
    },
  });
  Effect.runSync(Effect.withTracer(operation(), tracer));
  expect(spans).toContain(name);
});
