import { Config, ConfigProvider, Effect, Option } from "effect";
import type { EnvDefinition, EnvShape } from "../env-types.js";
import { EnvResolutionError, resolveEnv, type EnvSource, type ResolvedEnv } from "../resolve.js";

/** Internal bridge; the package export map intentionally does not expose this module. */
export function resolveEnvWithEffect<S extends EnvShape>(
  definition: EnvDefinition<S>,
  source: EnvSource,
  environment: string,
): Promise<ResolvedEnv<S>> {
  const provider = ConfigProvider.fromEnvRecord({ ...source }, { preserveEmptyStrings: true });
  return Effect.runPromise(makeConfig(definition, environment).parse(provider));
}

function makeConfig<S extends EnvShape>(
  definition: EnvDefinition<S>,
  environment: string,
): Config.Config<ResolvedEnv<S>> {
  const fields = Object.fromEntries(
    Object.keys(definition.shape).map((name) => [name, Config.option(Config.string(name))]),
  ) as Record<string, Config.Config<Option.Option<string>>>;

  return Config.all(fields).pipe(
    Config.mapOrFail((raw) =>
      Effect.try({
        try: () => resolveEnv(definition, { source: toSource(raw), environment }),
        catch: (cause) => toConfigError(cause),
      }),
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
