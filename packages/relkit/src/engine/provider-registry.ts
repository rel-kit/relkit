import { Effect, Exit, Scope } from "effect";
import { runEnginePromise } from "./engine-runtime.js";
import type { ProviderRegistry, ProviderRegistryOptions } from "./provider-registry-types.js";
import { acquireProviderRegistry } from "./provider-registry.service.js";

export * from "./provider-registry-types.js";
export {
  acquireProviderRegistry,
  ProviderRegistryLive,
  ProviderRegistryService,
} from "./provider-registry.service.js";

/** Acquire the providers for one generation with an explicit compatibility lifetime.
 * @param options - Verified graph, integration modules and isolated binding values.
 * @returns A registry whose release/dispose closes its owned provider scope.
 * @remarks Startup failure closes partially acquired providers in reverse order.
 * @see {@link acquireProviderRegistry} for scoped Effect composition.
 */
export async function createProviderRegistry(
  options: ProviderRegistryOptions,
): Promise<ProviderRegistry> {
  const scope = Scope.makeUnsafe();
  try {
    return await runEnginePromise(
      acquireProviderRegistry(options).pipe(Effect.provideService(Scope.Scope, scope)),
    );
  } catch (cause) {
    await runEnginePromise(Scope.close(scope, Exit.fail(cause)));
    throw cause;
  }
}
