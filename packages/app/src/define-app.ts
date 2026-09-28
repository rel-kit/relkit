import type { EnvShape } from "@relkit/config";
import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { createUnboundIdentityEffect, DescriptorIdentityFailure } from "@relkit/invocation";
import {
  normalizeTelemetryConfiguration,
  type TelemetryExporterMap,
} from "@relkit/observability/telemetry";
import { Effect, Result } from "effect";
import { observeApp } from "./app-observability.js";
import { APP_PROVIDER_CAPABILITIES } from "./app-provider-capabilities.js";
import {
  copyEffect,
  normalizeDefaultsEffect,
  normalizeProvidersEffect,
} from "./app-provider-normalization.js";
import {
  AppValidationFailure,
  assertExclusiveAliasEffect,
  isEnvDefinitionEffect,
  normalizeCompatibilityEffect,
} from "./app-validation.js";
import type {
  ApplicationDescriptor,
  AppProviderInputs,
  DefineAppOptions,
} from "./define-app.types.js";

export * from "./define-app.types.js";
export { APP_PROVIDER_CAPABILITIES } from "./app-provider-capabilities.js";

const OPTION_KEYS = new Set([
  "id",
  "title",
  "description",
  "tags",
  "env",
  "defaults",
  "compatibility",
  "telemetry",
  "server",
  "inspector",
  "deployment",
  ...APP_PROVIDER_CAPABILITIES,
  "jobs",
]);

/** Defines one immutable application topology in Effect.
 * @param options - Environment, providers, defaults, and runtime metadata.
 * @returns An application descriptor or AppValidationFailure.
 * @example Effect.runSync(defineAppEffect({ env: defineEnv({}) }));
 */
export const defineAppEffect = Effect.fn("App.defineApp")(
  <
    const Shape extends EnvShape,
    const Providers extends AppProviderInputs,
    const Exporters extends TelemetryExporterMap = TelemetryExporterMap,
  >(
    options: DefineAppOptions<Shape, Providers, Exporters>,
  ) =>
    observeApp(
      "define",
      Effect.gen(function* () {
        if (!isRecord(options) || !(yield* isEnvDefinitionEffect(options.env)))
          return yield* invalid("RELKIT app requires an environment definition");
        for (const key of Object.keys(options))
          if (!OPTION_KEYS.has(key)) return yield* invalid(`Unknown defineApp option "${key}"`);
        yield* assertExclusiveAliasEffect(options, "jobs", "job", "defineApp");
        yield* assertExclusiveAliasEffect(
          options.defaults ?? {},
          "jobs",
          "job",
          "defineApp defaults",
        );
        const providers = yield* normalizeProvidersEffect(options);
        const defaults = yield* normalizeDefaultsEffect(providers, options.defaults);
        const id =
          options.id ?? (yield* createUnboundIdentityEffect().pipe(Effect.mapError(fromCause)));
        const base = yield* Effect.try({
          try: () => createDescriptorBase("app", id, options),
          catch: fromCause,
        });
        const compatibility = yield* normalizeCompatibilityEffect(options.compatibility);
        const telemetry =
          options.telemetry === undefined
            ? undefined
            : yield* Effect.try({
                try: () => normalizeTelemetryConfiguration(options.telemetry),
                catch: fromCause,
              });
        const server = options.server === undefined ? undefined : yield* copyEffect(options.server);
        const inspector =
          options.inspector === undefined ? undefined : yield* copyEffect(options.inspector);
        const deployment =
          options.deployment === undefined ? undefined : yield* copyEffect(options.deployment);
        return deepFreeze({
          ...base,
          env: options.env,
          compatibility,
          ...providers,
          defaults,
          ...(telemetry === undefined ? {} : { telemetry }),
          ...(server === undefined ? {} : { server }),
          ...(inspector === undefined ? {} : { inspector }),
          ...(deployment === undefined ? {} : { deployment }),
        }) as unknown as ApplicationDescriptor<Shape, Providers, Exporters>;
      }),
    ),
);

/** Defines one immutable application topology synchronously.
 * @param options - Environment, providers, defaults, and runtime metadata.
 * @returns A frozen application descriptor.
 * @throws The original validation error for invalid options.
 * @example defineApp({ env: defineEnv({}), server: { port: 3000 } });
 * @category Application
 * @since 0.2.0
 */
export function defineApp<
  const Shape extends EnvShape,
  const Providers extends AppProviderInputs,
  const Exporters extends TelemetryExporterMap = TelemetryExporterMap,
>(
  options: DefineAppOptions<Shape, Providers, Exporters>,
): ApplicationDescriptor<Shape, Providers, Exporters> {
  const result = Effect.runSync(Effect.result(defineAppEffect(options)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

/** Constructs a typed invalid-input failure. */
function invalid(message: string): Effect.Effect<never, AppValidationFailure> {
  return Effect.fail(fromCause(new TypeError(message)));
}

/** Preserves the cause for the synchronous adapter. */
function fromCause(cause: unknown): AppValidationFailure {
  if (cause instanceof DescriptorIdentityFailure) cause = cause.cause;
  return new AppValidationFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

/** Checks for a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
