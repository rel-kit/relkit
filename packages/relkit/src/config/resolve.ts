import { Effect } from "effect";
import { observeConfig, runConfigSync } from "./config-observability.js";
import { ConfigValidationError } from "./config-validation-error.js";
import { EnvResolutionError } from "./env-resolution-error.js";
import { definitionIssue, optionsIssue, resolveField } from "./resolve-helpers.js";
import type { EnvDefinition, EnvShape } from "./env.types.js";
import type { EnvIssue, EnvProjection, ResolveEnvOptions, ResolvedEnv } from "./resolve.types.js";

export { EnvResolutionError } from "./env-resolution-error.js";
export type {
  EnvIssue,
  EnvProjection,
  EnvSource,
  ResolveEnvOptions,
  ResolvedEnv,
} from "./resolve.types.js";

/** Resolve all declared values with ordered, typed failures.
 * @param definition - Value-free field declaration.
 * @param options - Environment name and explicit source.
 * @returns Effect with immutable values or ConfigValidationError or EnvResolutionError.
 * @example Effect.runSync(resolveEnvEffect(defineEnv({ MODE: env.string() }), { environment: "test", source: { MODE: "ready" } }));
 */
export function resolveEnvEffect<S extends EnvShape>(
  definition: EnvDefinition<S>,
  options: ResolveEnvOptions,
): Effect.Effect<ResolvedEnv<S>, ConfigValidationError | EnvResolutionError> {
  return observeConfig(
    "resolve",
    Effect.gen(function* () {
      const invalidDefinition = definitionIssue(definition);
      if (invalidDefinition)
        return yield* Effect.fail(new ConfigValidationError({ message: invalidDefinition }));
      const invalidOptions = optionsIssue(options);
      if (invalidOptions)
        return yield* Effect.fail(new ConfigValidationError({ message: invalidOptions }));
      const values: Record<string, unknown> = {};
      const issues: EnvIssue[] = [];
      for (const name of Object.keys(definition.shape)) {
        resolveField(
          name,
          definition.shape[name]!,
          options.source,
          options.environment,
          values,
          issues,
        );
      }
      if (issues.length) return yield* Effect.fail(new EnvResolutionError(issues));
      return Object.freeze(values) as ResolvedEnv<S>;
    }),
  );
}

/** Resolve a declaration synchronously for existing callers.
 * @param definition - Value-free field declaration.
 * @param options - Environment name and explicit source.
 * @returns Immutable inferred values.
 * @throws TypeError for invalid inputs; EnvResolutionError for field issues.
 * @example resolveEnv(defineEnv({ MODE: env.string() }), { environment: "test", source: { MODE: "ready" } });
 */
export function resolveEnv<S extends EnvShape>(
  definition: EnvDefinition<S>,
  options: ResolveEnvOptions,
): ResolvedEnv<S> {
  return runConfigSync(resolveEnvEffect(definition, options));
}

/** Project sorted, JSON-safe metadata without source values.
 * @param definition - Value-free field declaration.
 * @returns Effect with frozen metadata or ConfigValidationError.
 * @example Effect.runSync(projectEnvEffect(defineEnv({ MODE: env.string() })));
 */
export function projectEnvEffect<S extends EnvShape>(
  definition: EnvDefinition<S>,
): Effect.Effect<readonly EnvProjection[], ConfigValidationError> {
  return observeConfig(
    "project",
    Effect.gen(function* () {
      const issue = definitionIssue(definition);
      if (issue) return yield* Effect.fail(new ConfigValidationError({ message: issue }));
      return Object.freeze(
        Object.keys(definition.shape)
          .sort()
          .map((name) => Object.freeze({ name, ...definition.shape[name]!.metadata })),
      );
    }),
  );
}

/** Project metadata synchronously for existing callers.
 * @param definition - Value-free field declaration.
 * @returns Frozen, sorted metadata.
 * @throws TypeError for a malformed definition.
 * @example projectEnv(defineEnv({ MODE: env.string() }));
 */
export function projectEnv<S extends EnvShape>(
  definition: EnvDefinition<S>,
): readonly EnvProjection[] {
  return runConfigSync(projectEnvEffect(definition));
}
