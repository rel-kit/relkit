import { serializeJson } from "@relkit/contracts";
import { Effect } from "effect";
import { defineProviderCapability, normalizeProviderProfiles } from "@relkit/provider";
import { APP_PROVIDER_CAPABILITIES } from "./app-provider-capabilities.js";
import { AppValidationFailure } from "./app-validation.js";
import type {
  AppProviderCapability,
  AppProviderDefaults,
  AppProviderInputs,
  NormalizedAppProviderDefaults,
} from "./define-app.types.js";
import type { NormalizedProviderProfiles, ProviderSourceInput } from "@relkit/provider";

/** Normalizes configured provider profiles in capability order.
 * @param options - Authored provider bindings.
 * @returns Normalized profiles or AppValidationFailure.
 * @example Effect.runSync(normalizeProvidersEffect({}));
 */
export const normalizeProvidersEffect = Effect.fn("App.normalizeProviders")(
  (options: AppProviderInputs) =>
    Effect.gen(function* () {
      const result: Partial<Record<AppProviderCapability, NormalizedProviderProfiles>> = {};
      for (const capability of APP_PROVIDER_CAPABILITIES) {
        const input = capability === "job" ? (options.jobs ?? options.job) : options[capability];
        if (input !== undefined)
          result[capability] = yield* Effect.try({
            try: () =>
              normalizeProviderProfiles(
                defineProviderCapability(capability),
                input as ProviderSourceInput | Readonly<Record<string, ProviderSourceInput>>,
              ),
            catch: failure,
          });
      }
      return result;
    }),
);

/** Checks default profile selections and returns an immutable copy.
 * @param providers - Normalized available provider profiles.
 * @param defaults - Optional selected profile names.
 * @returns Frozen defaults or AppValidationFailure.
 * @example Effect.runSync(normalizeDefaultsEffect({}, undefined));
 */
export const normalizeDefaultsEffect = Effect.fn("App.normalizeDefaults")(
  <Providers extends AppProviderInputs>(
    providers: Partial<Record<AppProviderCapability, NormalizedProviderProfiles>>,
    defaults: AppProviderDefaults<Providers> | undefined,
  ) =>
    Effect.gen(function* () {
      const result: Partial<Record<AppProviderCapability, string>> = {};
      for (const [rawCapability, selected] of Object.entries(defaults ?? {})) {
        const capability = rawCapability === "jobs" ? "job" : rawCapability;
        if (!APP_PROVIDER_CAPABILITIES.includes(capability as AppProviderCapability))
          return yield* Effect.fail(
            failure(new TypeError(`Unknown default capability "${capability}"`)),
          );
        const profiles = providers[capability as AppProviderCapability]?.profiles;
        if (typeof selected !== "string" || profiles?.[selected] === undefined)
          return yield* Effect.fail(
            failure(new TypeError(`defaults.${capability} must reference a configured profile`)),
          );
        result[capability as AppProviderCapability] = selected;
      }
      return (yield* copyEffect(result)) as NormalizedAppProviderDefaults<Providers>;
    }),
);

/** Copies a serializable configuration value through RELKIT's serializer.
 * @param value - Configuration value to copy.
 * @returns A JSON copy or AppValidationFailure.
 * @example Effect.runSync(copyEffect({ port: 3000 }));
 */
export const copyEffect = Effect.fn("App.copy")(<Value>(value: Value) =>
  Effect.try({
    try: () => JSON.parse(serializeJson(value)) as Value,
    catch: failure,
  }),
);

/** Keeps original errors available to compatibility adapters. */
function failure(cause: unknown): AppValidationFailure {
  return new AppValidationFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
