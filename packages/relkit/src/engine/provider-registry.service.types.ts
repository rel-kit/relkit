import type { Effect, Scope } from "effect";
import type { ProviderRegistry, ProviderRegistryOptions } from "./provider-registry-types.js";

/** Provider acquisition requires the caller's generation scope. */
export interface ProviderRegistryOperations {
  readonly acquire: (
    options: ProviderRegistryOptions,
  ) => Effect.Effect<ProviderRegistry, unknown, Scope.Scope>;
}
