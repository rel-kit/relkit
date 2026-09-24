import { Config, ConfigProvider, Effect, Option } from "effect";
import { observeConfig } from "../config-observability.js";
import type { EnvDefinition, EnvShape } from "../env.types.js";
import {
  EnvResolutionError,
  resolveEnvEffect,
  type EnvSource,
  type ResolvedEnv,
} from "../resolve.js";

/** Resolve through an explicit Effect ConfigProvider.
 * @param definition - Value-free field declaration.
 * @param source - Explicit source values.
 * @param environment - Environment name for requirement rules.
 * @returns Effect with inferred values or Config.ConfigError.
 * @example Effect.runPromise(resolveEnvWithEffectEffect(definition, { MODE: "test" }, "test"));
 */
export function resolveEnvWithEffectEffect<S extends EnvShape>(
  definition: EnvDefinition<S>,
  source: EnvSource,
  environment: string,
): Effect.Effect<ResolvedEnv<S>, Config.ConfigError> {
  return observeConfig(
    "resolve-provider",
    Effect.suspend(() => {
      const provider = ConfigProvider.fromEnvRecord({ ...source }, { preserveEmptyStrings: true });
      return makeConfig(definition, environment).parse(provider);
    }),
  );
}

/** Promise compatibility adapter for the internal ConfigProvider bridge.
 * @param definition - Value-free field declaration.
 * @param source - Explicit source values.
 * @param environment - Environment name for requirement rules.
 * @returns Promise with inferred values; rejects with Config.ConfigError.
 * @example await resolveEnvWithEffect(definition, { MODE: "test" }, "test");
 */
export function resolveEnvWithEffect<S extends EnvShape>(
  definition: EnvDefinition<S>,
  source: EnvSource,
  environment: string,
): Promise<ResolvedEnv<S>> {
  return Effect.runPromise(resolveEnvWithEffectEffect(definition, source, environment));
}

function makeConfig<S extends EnvShape>(
  definition: EnvDefinition<S>,
  environment: string,
): Config.Config<ResolvedEnv<S>> {
  const fields = Object.fromEntries(
    Object.keys(definition.shape).map((name) => [name, Config.option(Config.String(name))]),
  ) as Record<string, Config.Config<Option.Option<string>>>;

  return Config.all(fields).pipe(
    Config.mapEffect((raw) =>
      Effect.mapError(
        resolveEnvEffect(definition, { source: toSource(raw), environment }),
        toConfigError,
      ),
    ),
  );
}

function toSource(raw: Record<string, Option.Option<string>>): EnvSource {
  const source: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(raw)) {
    source[name] = Option.isSome(value) ? value.value : undefined;
  }
  return source;
}

function toConfigError(cause: unknown): Config.ConfigError {
  const message =
    cause instanceof EnvResolutionError ? cause.message : "Environment resolution failed";
  return new Config.ConfigError(new ConfigProvider.SourceError({ message, cause }));
}
