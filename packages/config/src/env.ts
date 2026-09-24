import { Effect } from "effect";
import { observeConfig, runConfigSync } from "./config-observability.js";
import { ConfigValidationError } from "./config-validation-error.js";
import { createEnvRefEffect } from "./env-ref.js";
import type { EnvDefinition, EnvMetadataMap, EnvShape } from "./env.types.js";

export { env } from "./env-factory.js";
export { isEnvRef } from "./env-ref.js";
export type { JsonValue } from "./env-json.types.js";
export type {
  EnvBuilder,
  EnvBuilderBase,
  EnvBuilderFactory,
  BindingValueRef,
  EnvDefinition,
  EnvMetadata,
  EnvMetadataMap,
  EnvShape,
  EnvValueType,
  EnvRef,
  InferEnvValue,
  InferEnvValues,
  LiteralValue,
} from "./env.types.js";

/** Build an immutable declaration without reading runtime values.
 * @param shape - Field builders keyed by public environment names.
 * @returns Effect with a frozen declaration or ConfigValidationError.
 * @example Effect.runSync(defineEnvEffect({ MODE: env.string() }));
 */
export function defineEnvEffect<const S extends EnvShape>(
  shape: S & { readonly PORT?: never; readonly RELKIT_ENV?: never },
): Effect.Effect<EnvDefinition<S>, ConfigValidationError> {
  return observeConfig(
    "define",
    Effect.gen(function* () {
      if (shape === null || typeof shape !== "object" || Array.isArray(shape)) {
        return yield* Effect.fail(
          new ConfigValidationError({
            message: "Environment definitions must contain env builders",
          }),
        );
      }
      const entries = Object.keys(shape).map((name) => [name, shape[name]!] as const);
      if (
        entries.some(
          ([, field]) =>
            field === null || typeof field !== "object" || field.kind !== "env-builder",
        )
      ) {
        return yield* Effect.fail(
          new ConfigValidationError({
            message: "Environment definitions must contain env builders",
          }),
        );
      }
      const frozenShape = Object.freeze({ ...shape }) as S;
      const metadata = Object.freeze(
        Object.fromEntries(entries.map(([name, field]) => [name, field.metadata])),
      ) as EnvMetadataMap<S>;
      const definition: Record<string, unknown> = {
        kind: "env-definition",
        shape: frozenShape,
        metadata,
      };
      for (const [name, field] of entries) {
        if (name === "PORT" || name === "RELKIT_ENV") {
          return yield* Effect.fail(
            new ConfigValidationError({
              message: `Environment variable name "${name}" is framework-reserved${
                name === "PORT" ? "; configure server.port instead" : ""
              }.`,
            }),
          );
        }
        if (name === "kind" || name === "shape" || name === "metadata") {
          return yield* Effect.fail(
            new ConfigValidationError({
              message: `Environment variable name "${name}" is reserved`,
            }),
          );
        }
        Object.defineProperty(definition, name, {
          value: yield* createEnvRefEffect(name, field),
          enumerable: false,
        });
      }
      return Object.freeze(definition) as EnvDefinition<S>;
    }),
  );
}

/** Build a declaration synchronously for existing callers.
 * @param shape - Field builders keyed by public environment names.
 * @returns Immutable declaration and typed references.
 * @throws TypeError for a reserved name or invalid builder.
 * @example defineEnv({ MODE: env.string() });
 */
export function defineEnv<const S extends EnvShape>(
  shape: S & { readonly PORT?: never; readonly RELKIT_ENV?: never },
): EnvDefinition<S> {
  return runConfigSync(defineEnvEffect(shape));
}
