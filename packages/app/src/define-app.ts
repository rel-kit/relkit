/**
 * Constructs immutable application descriptors without acquiring providers or
 * optional tools. Shared bridge validation rejects obsolete inspection settings;
 * the synchronous facade preserves original validation errors for authors.
 */
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
import { normalizeDefaultsEffect, normalizeProvidersEffect } from "./app-provider-normalization.js";
import { normalizeAppRuntimeMetadataEffect } from "./app-runtime-metadata.js";
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
        yield* assertExclusiveAliasEffect(
          { jobs: options.jobs, job: options.job },
          "jobs",
          "job",
          "defineApp",
        );
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
        const { server, inspector, deployment } = yield* normalizeAppRuntimeMetadataEffect(options);
        // Provider/default normalizers retain the authored generic profile keys.
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
        }) as ApplicationDescriptor<Shape, Providers, Exporters>;
      }),
    ),
);

/** Defines one immutable application topology synchronously.
 * @param options - Environment, providers, defaults, and runtime metadata.
 * @returns A frozen application descriptor.
 * @throws The original validation error for invalid options.
 * @example
 * ```ts
 * import { defineApp } from "@relkit/app";
 * import { defineEnv } from "@relkit/config";
 * const app = defineApp({ env: defineEnv({}), server: { port: 3000 } });
 * ```
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

/** Constructs a typed invalid-input failure.
 * @param message - Safe author correction guidance.
 * @returns The rejected validation effect.
 */
function invalid(message: string): Effect.Effect<never, AppValidationFailure> {
  return Effect.fail(fromCause(new TypeError(message)));
}

/** Preserves the cause for the synchronous adapter.
 * @typeParam Failure - Original validation or identity rejection.
 * @param cause - Failure retained for the public synchronous boundary.
 * @returns Typed validation error preserving its original cause.
 */
function fromCause<Failure>(cause: Failure): AppValidationFailure {
  const original = cause instanceof DescriptorIdentityFailure ? cause.cause : cause;
  return new AppValidationFailure({
    message: original instanceof Error ? original.message : String(original),
    cause: original,
  });
}

/** Checks that authoring input is a non-array object.
 * @typeParam Value - Actual constructor input type retained by the guard.
 * @param value - Candidate input before property access.
 * @returns Whether the input is a non-null, non-array object.
 */
function isRecord<Value>(value: Value): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
