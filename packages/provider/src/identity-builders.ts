import { Effect } from "effect";
import { ProviderInputError } from "./provider-compat-errors.js";
import { frozen, stable } from "./protocol-builder-utils.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
import type {
  IntegrationReference,
  ProviderCapability,
  ProviderFeature,
  ProviderLocalRecipeReference,
} from "./protocol.types.js";
/** Define a stable provider capability in an Effect.
 * @param id - Capability identifier.
 * @returns An Effect with a frozen capability or tagged validation error.
 * @example Effect.runSync(defineProviderCapabilityEffect("cache"));
 */
export function defineProviderCapabilityEffect<const Id extends string>(
  id: Id,
): Effect.Effect<ProviderCapability<Id>, ProviderError> {
  return observeProvider(
    "capability.define",
    providerCalculation(
      "INVALID_ID",
      () => frozen({ kind: "provider-capability", id: stable(id) }) as ProviderCapability<Id>,
    ),
  );
}
/** Define a stable capability synchronously.
 * @param id - Capability identifier.
 * @returns A frozen capability.
 * @throws TypeError for invalid identifiers.
 * @example defineProviderCapability("cache");
 */
export function defineProviderCapability<const Id extends string>(id: Id): ProviderCapability<Id> {
  return runProvider(defineProviderCapabilityEffect(id));
}
/** Define an adapter feature in an Effect.
 * @param capability - Capability owning the feature.
 * @param id - Feature identifier.
 * @returns An Effect with a frozen feature or tagged validation error.
 * @example Effect.runSync(defineProviderFeatureEffect(cache, "atomicIncrement"));
 */
export function defineProviderFeatureEffect<
  const Capability extends ProviderCapability,
  const Id extends string,
>(
  capability: Capability,
  id: Id,
): Effect.Effect<ProviderFeature<Capability["id"], Id>, ProviderError> {
  return observeProvider(
    "feature.define",
    providerCalculation("INVALID_ID", () => {
      return frozen({
        kind: "provider-feature",
        capability: capability.id,
        id: stable(id),
      }) as unknown as ProviderFeature<Capability["id"], Id>;
    }),
  );
}
/** Define an adapter feature synchronously.
 * @param capability - Capability owning the feature.
 * @param id - Feature identifier.
 * @returns A frozen feature.
 * @throws TypeError for invalid identifiers.
 * @example defineProviderFeature(cache, "atomicIncrement");
 */
export function defineProviderFeature<
  const Capability extends ProviderCapability,
  const Id extends string,
>(capability: Capability, id: Id): ProviderFeature<Capability["id"], Id> {
  return runProvider(defineProviderFeatureEffect(capability, id));
}
/** Define a static integration identity in an Effect.
 * @param integrationId - Integration identifier, never an import path.
 * @returns An Effect with a frozen reference or tagged validation error.
 * @example Effect.runSync(defineIntegrationReferenceEffect("redis"));
 */
export function defineIntegrationReferenceEffect<const Id extends string>(
  integrationId: Id,
): Effect.Effect<IntegrationReference<Id>, ProviderError> {
  return observeProvider(
    "integration.define",
    providerCalculation("INVALID_ID", () => {
      return frozen({
        kind: "integration-reference",
        integrationId: stable(integrationId),
      }) as unknown as IntegrationReference<Id>;
    }),
  );
}
/** Define a static integration identity synchronously.
 * @param integrationId - Integration identifier.
 * @returns A frozen reference.
 * @throws TypeError for invalid identifiers.
 * @example defineIntegrationReference("redis");
 */
export function defineIntegrationReference<const Id extends string>(
  integrationId: Id,
): IntegrationReference<Id> {
  return runProvider(defineIntegrationReferenceEffect(integrationId));
}
/** Define versioned local-recipe provenance in an Effect.
 * @param integration - Owning integration reference.
 * @param recipeId - Local recipe identifier.
 * @param recipeVersion - Positive integer version.
 * @returns An Effect with a frozen recipe reference or tagged validation error.
 * @example Effect.runSync(defineLocalRecipeReferenceEffect(redis, "redis-docker", 1));
 */
export function defineLocalRecipeReferenceEffect(
  integration: IntegrationReference,
  recipeId: string,
  recipeVersion: number,
): Effect.Effect<ProviderLocalRecipeReference, ProviderError> {
  return observeProvider(
    "recipe.define",
    providerCalculation("INVALID_DESCRIPTOR", () => {
      if (!Number.isSafeInteger(recipeVersion) || recipeVersion < 1)
        throw new ProviderInputError("Local recipe version must be a positive integer");
      return frozen({
        integrationId: integration.integrationId,
        recipeId: stable(recipeId),
        recipeVersion,
      });
    }),
  );
}
/** Define versioned local-recipe provenance synchronously.
 * @param integration - Owning integration reference.
 * @param recipeId - Local recipe identifier.
 * @param recipeVersion - Positive integer version.
 * @returns A frozen recipe reference.
 * @throws TypeError for invalid versions or identifiers.
 * @example defineLocalRecipeReference(redis, "redis-docker", 1);
 */
export function defineLocalRecipeReference(
  integration: IntegrationReference,
  recipeId: string,
  recipeVersion: number,
): ProviderLocalRecipeReference {
  return runProvider(defineLocalRecipeReferenceEffect(integration, recipeId, recipeVersion));
}
