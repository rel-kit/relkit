import { expect, test } from "vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  ProviderTelemetry,
  ProviderValidationError,
  createBindingValueRefEffect,
  defineConnectionContractEffect,
  defineInfrastructureProviderSourceEffect,
  defineIntegrationReferenceEffect,
  defineLocalProviderSourceEffect,
  defineLocalRecipeReferenceEffect,
  defineProviderAccessEffect,
  defineProviderAdapterEffect,
  defineProviderBehaviorEffect,
  defineProviderCapabilityEffect,
  defineProviderFeatureEffect,
  isBindingValueRefEffect,
  normalizeProviderBindingEffect,
  normalizeProviderProfilesEffect,
  normalizeProviderSourceEffect,
  resolveProviderConnectionEffect,
  selectProviderProfileEffect,
  providerCalculation,
  runProvider,
  defineConnectionContract,
  defineIntegrationReference,
  defineLocalRecipeReference,
  defineProviderAdapter,
  defineProviderBehavior,
  defineProviderCapability,
  normalizeProviderProfiles,
  selectProviderProfile,
  type ProviderOperation,
} from "../src/index.js";
const cache = defineProviderCapability("cache");
const redis = defineIntegrationReference("redis");
const contract = defineConnectionContract({ url: {} });
const behavior = defineProviderBehavior({});
const recipe = defineLocalRecipeReference(redis, "redis-docker", 1);
const adapter = defineProviderAdapter({
  integration: redis,
  capability: cache,
  adapterId: "redis",
  connectionContract: contract,
  connection: { url: "redis://local" },
  behavior,
  localRecipe: recipe,
});
const selection = selectProviderProfile(normalizeProviderProfiles(cache, adapter), {
  descriptorId: "cart",
});
test("all executable public operations use a substitutable telemetry Layer", () => {
  const seen: ProviderOperation[] = [];
  const layer = Layer.succeed(ProviderTelemetry, {
    observe: <A, E, R>(operation: ProviderOperation, effect: Effect.Effect<A, E, R>) => {
      seen.push(operation);
      return effect;
    },
  });
  const effects = [
    createBindingValueRefEffect("URL", "string"),
    isBindingValueRefEffect({}),
    defineProviderCapabilityEffect("cache"),
    defineProviderFeatureEffect(cache, "atomic"),
    defineConnectionContractEffect({ url: {} }),
    defineProviderBehaviorEffect({}),
    defineProviderAccessEffect({}),
    defineIntegrationReferenceEffect("redis"),
    defineLocalRecipeReferenceEffect(redis, "docker", 1),
    defineProviderAdapterEffect({
      integration: redis,
      capability: cache,
      adapterId: "redis",
      connectionContract: contract,
      connection: { url: "redis://local" },
      behavior,
    }),
    defineLocalProviderSourceEffect(adapter),
    defineInfrastructureProviderSourceEffect(adapter, redis, {}),
    normalizeProviderSourceEffect(adapter),
    normalizeProviderProfilesEffect(cache, adapter),
    selectProviderProfileEffect(normalizeProviderProfiles(cache, adapter), {
      descriptorId: "cart",
    }),
    normalizeProviderBindingEffect(selection, { descriptorId: "cart" }),
    resolveProviderConnectionEffect(adapter, { profile: "default" }),
  ];
  Effect.runSync(Effect.provide(Effect.all(effects), layer));
  expect(seen).toEqual([
    "binding-value.create",
    "binding-value.is-ref",
    "capability.define",
    "feature.define",
    "connection.define",
    "behavior.define",
    "access.define",
    "integration.define",
    "recipe.define",
    "adapter.define",
    "source.local",
    "source.infrastructure",
    "source.normalize",
    "profile.normalize",
    "profile.select",
    "binding.normalize",
    "binding.resolve",
  ]);
});
test("Effect failures have recoverable stable tags", () => {
  expect(
    Effect.runSync(
      Effect.catchTag(defineProviderCapabilityEffect(""), "ProviderValidationError", (error) =>
        Effect.succeed(error.code),
      ),
    ),
  ).toBe("INVALID_ID");
  expect(
    Effect.runSync(
      Effect.catchTag(
        selectProviderProfileEffect(
          normalizeProviderProfiles(cache, {
            one: adapter,
            two: adapter,
          }),
          { descriptorId: "cart" },
        ),
        "ProviderProfileSelectionError",
        (error) => Effect.succeed(error.code),
      ),
    ),
  ).toBe("AMBIGUOUS_PROVIDER_PROFILE");
  expect(
    Effect.runSync(
      Effect.catchTag(
        normalizeProviderBindingEffect(selection, {
          descriptorId: "cart",
          requiredFeatures: ["missing"],
        }),
        "ProviderFeatureMismatchError",
        (error) => Effect.succeed(error.code),
      ),
    ),
  ).toBe("MISSING_PROVIDER_FEATURE");
  expect(
    Effect.runSync(
      Effect.catchTag(
        resolveProviderConnectionEffect(adapter, {
          profile: "default",
          local: { url: "redis://other" },
        }),
        "ProviderBindingResolutionError",
        (error) => Effect.succeed(error.code),
      ),
    ),
  ).toBe("CONFLICTING_CONNECTION_VALUE");
});
test("unexpected exceptions remain defects instead of becoming domain errors", () => {
  const unexpected = new Error("unexpected implementation failure");
  const exit = Effect.runSyncExit(
    providerCalculation("INVALID_DESCRIPTOR", () => {
      throw unexpected;
    }),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(unexpected);
  expect(() => runProvider(Effect.die(unexpected))).toThrow(unexpected);
});
test("already tagged failures stay tagged in the Effect channel", () => {
  const original = new ProviderValidationError({
    code: "INVALID_DESCRIPTOR",
    message: "invalid descriptor",
  });
  const recovered = Effect.runSync(
    Effect.catchTag(
      providerCalculation("INVALID_DESCRIPTOR", () => {
        throw original;
      }),
      "ProviderValidationError",
      (error) => Effect.succeed(error),
    ),
  );
  expect(recovered).toBe(original);
});
