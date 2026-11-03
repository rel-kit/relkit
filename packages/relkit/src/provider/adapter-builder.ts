import { Effect } from "effect";
import { ProviderInputError } from "./provider-compat-errors.js";
import type {
  BuiltProviderAdapter,
  DefineProviderAdapterOptions,
} from "./adapter-builder.types.js";
import { frozen, stable } from "./protocol-builder-utils.js";
import { PROVIDER_PROTOCOL_VERSION } from "./protocol.js";
import type {
  ProviderBehavior,
  ProviderCapability,
  ProviderConnectionValues,
} from "./protocol.types.js";
import {
  observeProvider,
  providerCalculation,
  runProvider,
  type ProviderError,
} from "./provider-observability.js";
export type { DefineProviderAdapterOptions } from "./adapter-builder.types.js";
/** Define and validate a pure provider adapter in an Effect.
 * @param options - Integration, capability, connection, behavior, and features.
 * @returns An Effect with a frozen adapter or a tagged validation error.
 * @example Effect.runSync(defineProviderAdapterEffect(options));
 */
export function defineProviderAdapterEffect<
  const Capability extends ProviderCapability,
  const AdapterId extends string,
  const Connection extends ProviderConnectionValues,
  const Behavior extends ProviderBehavior,
>(
  options: DefineProviderAdapterOptions<Capability, AdapterId, Connection, Behavior>,
): Effect.Effect<BuiltProviderAdapter<Capability, AdapterId, Connection, Behavior>, ProviderError> {
  return observeProvider(
    "adapter.define",
    providerCalculation("INVALID_DESCRIPTOR", () => {
      const fields = new Set(Object.keys(options.connectionContract.fields));
      for (const name of Object.keys(options.connection))
        if (!fields.has(name)) throw new ProviderInputError(`Unknown connection field "${name}"`);
      const features = [...(options.features ?? [])].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      if (features.some((feature) => feature.capability !== options.capability.id))
        throw new ProviderInputError(
          `Provider feature capability must be "${options.capability.id}"`,
        );
      if (new Set(features.map((feature) => feature.id)).size !== features.length)
        throw new ProviderInputError("Duplicate provider feature");
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
      }) as unknown as BuiltProviderAdapter<Capability, AdapterId, Connection, Behavior>;
    }),
  );
}
/** Define and validate a pure provider adapter synchronously.
 * @param options - Integration, capability, connection, behavior, and features.
 * @returns A frozen adapter descriptor.
 * @throws TypeError for unknown fields, invalid features, or invalid identifiers.
 * @example defineProviderAdapter(options);
 */
export function defineProviderAdapter<
  const Capability extends ProviderCapability,
  const AdapterId extends string,
  const Connection extends ProviderConnectionValues,
  const Behavior extends ProviderBehavior,
>(
  options: DefineProviderAdapterOptions<Capability, AdapterId, Connection, Behavior>,
): BuiltProviderAdapter<Capability, AdapterId, Connection, Behavior> {
  return runProvider(defineProviderAdapterEffect(options));
}
