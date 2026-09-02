import { deepFreeze, normalizeId, serializeJson, type JsonValue } from "@relkit/contracts";
import {
  PROVIDER_PROTOCOL_VERSION,
  type IntegrationReference,
  type ProviderAccess,
  type ProviderAdapter,
  type ProviderBehavior,
  type ProviderCapability,
  type ProviderConnectionContract,
  type ProviderConnectionField,
  type ProviderConnectionFieldInput,
  type ProviderConnectionValues,
  type ProviderFeature,
  type ProviderLocalRecipeReference,
} from "./protocol-types.js";

/**
 * Defines a stable provider capability identity.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineProviderCapability<const Id extends string>(id: Id): ProviderCapability<Id> {
  return frozen({ kind: "provider-capability", id: stable(id) }) as ProviderCapability<Id>;
}

/**
 * Defines one feature supported by adapters for a capability.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineProviderFeature<
  const Capability extends ProviderCapability,
  const Id extends string,
>(capability: Capability, id: Id): ProviderFeature<Capability["id"], Id> {
  return frozen({
    kind: "provider-feature",
    capability: capability.id,
    id: stable(id),
  }) as ProviderFeature<Capability["id"], Id>;
}

/**
 * Defines the fields that local, infrastructure, or runtime values may materialize.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineConnectionContract(
  fields: Readonly<Record<string, ProviderConnectionFieldInput>>,
): ProviderConnectionContract {
  const normalized: Record<string, ProviderConnectionField> = {};
  for (const [name, field] of Object.entries(fields).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const key = stable(name);
    if (normalized[key] !== undefined) throw new TypeError(`Duplicate connection field "${key}"`);
    normalized[key] = {
      required: field.required ?? true,
      sensitive: field.sensitive ?? false,
      authoredValue: field.authoredValue ?? "fixed",
      ...(field.default === undefined ? {} : { default: field.default }),
    };
  }
  return frozen({
    kind: "provider-connection-contract",
    fields: normalized,
  }) as unknown as ProviderConnectionContract;
}

/**
 * Keeps adapter behavior separate from connection materialization.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineProviderBehavior<const Value extends JsonValue>(
  value: Value,
): ProviderBehavior<Value> {
  return frozen({ kind: "provider-behavior", value }) as ProviderBehavior<Value>;
}

/**
 * Defines explicit binding or infrastructure access metadata.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineProviderAccess<const Value extends JsonValue>(
  value: Value,
): ProviderAccess<Value> {
  return frozen({ kind: "provider-access", value }) as ProviderAccess<Value>;
}

/**
 * Defines a static integration identity without accepting an import path.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineIntegrationReference<const Id extends string>(
  integrationId: Id,
): IntegrationReference<Id> {
  return frozen({
    kind: "integration-reference",
    integrationId: stable(integrationId),
  }) as IntegrationReference<Id>;
}

/**
 * Defines versioned local-recipe provenance for an adapter.
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineLocalRecipeReference(
  integration: IntegrationReference,
  recipeId: string,
  recipeVersion: number,
): ProviderLocalRecipeReference {
  if (!Number.isSafeInteger(recipeVersion) || recipeVersion < 1)
    throw new TypeError("Local recipe version must be a positive integer");
  return frozen({
    integrationId: integration.integrationId,
    recipeId: stable(recipeId),
    recipeVersion,
  });
}

/**
 * Defines a pure adapter descriptor for an integration package.
 *
 * @example
 * ```ts
 * import {
 *   defineConnectionContract,
 *   defineIntegrationReference,
 *   defineProviderAdapter,
 *   defineProviderBehavior,
 *   defineProviderCapability,
 * } from "@relkit/provider";
 * const cache = defineProviderCapability("cache");
 * const redis = defineProviderAdapter({
 *   integration: defineIntegrationReference("redis"),
 *   capability: cache,
 *   adapterId: "redis",
 *   connectionContract: defineConnectionContract({ url: { sensitive: true } }),
 *   connection: { url: "redis://localhost:6379" },
 *   behavior: defineProviderBehavior({}),
 * });
 * ```
 * @category Provider protocol
 * @since 0.2.0
 */
export function defineProviderAdapter<
  const Capability extends ProviderCapability,
  const AdapterId extends string,
  const Connection extends ProviderConnectionValues,
  const Behavior extends ProviderBehavior,
>(options: {
  readonly integration: IntegrationReference;
  readonly capability: Capability;
  readonly adapterId: AdapterId;
  readonly connectionContract: ProviderConnectionContract;
  readonly connection: Connection;
  readonly behavior: Behavior;
  readonly features?: readonly ProviderFeature<Capability["id"]>[];
  readonly localRecipe?: ProviderLocalRecipeReference;
}): ProviderAdapter<Capability, AdapterId, Connection, Behavior> {
  const fields = new Set(Object.keys(options.connectionContract.fields));
  for (const name of Object.keys(options.connection))
    if (!fields.has(name)) throw new TypeError(`Unknown connection field "${name}"`);
  const features = [...(options.features ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  if (features.some((feature) => feature.capability !== options.capability.id))
    throw new TypeError(`Provider feature capability must be "${options.capability.id}"`);
  if (new Set(features.map((feature) => feature.id)).size !== features.length)
    throw new TypeError("Duplicate provider feature");
  return frozen({
    kind: "provider-adapter",
    protocolVersion: PROVIDER_PROTOCOL_VERSION,
    integration: options.integration,
    capability: options.capability,
    adapterId: stable(options.adapterId),
    connectionContract: options.connectionContract,
    connection: options.connection,
    behavior: options.behavior,
    features,
    ...(options.localRecipe === undefined ? {} : { localRecipe: options.localRecipe }),
  }) as unknown as ProviderAdapter<Capability, AdapterId, Connection, Behavior>;
}

function stable<const Value extends string>(value: Value): Value {
  return normalizeId(value) as unknown as Value;
}

function frozen<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(serializeJson(value)) as Value);
}
