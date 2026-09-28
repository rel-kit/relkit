import type { RealtimeProvider, RealtimeLimits } from "./provider.types.js";
import type { Effect } from "effect";
import type { RealtimeProviderError } from "./realtime-errors.js";

/** Configuration for a provider-backed generation dispatcher.
 * @example const options: ProviderRealtimeDispatcherOptions = { applicationId: "app", environment: "dev", generationId: "g1", publicFingerprint: "p1", provider: async () => provider };
 */
export interface ProviderRealtimeDispatcherOptions {
  readonly applicationId: string;
  readonly environment: string;
  readonly generationId: string;
  readonly publicFingerprint: string;
  /** Resolves a provider for one profile.
   * @param profile - Validated profile name.
   * @param signal - Optional cancellation signal for an in-flight lookup.
   * @returns A provider or lookup rejection.
   * @example await options.provider("default", controller.signal);
   */
  readonly provider: (
    profile: string,
    signal?: AbortSignal,
  ) => Promise<RealtimeProvider> | RealtimeProvider;
  readonly limits?: Partial<RealtimeLimits>;
}

/** Injectable provider resolver used by Effect-native dispatcher operations.
 * @example const source: RealtimeProviderSourceService = { resolve: () => Effect.succeed(provider) };
 */
export interface RealtimeProviderSourceService {
  /** Resolves the provider configured for one profile.
   * @param profile - Validated profile name.
   * @returns An Effect of the provider or RealtimeProviderError.
   * @example Effect.runPromise(source.resolve("default"));
   */
  readonly resolve: (profile: string) => Effect.Effect<RealtimeProvider, RealtimeProviderError>;
}
