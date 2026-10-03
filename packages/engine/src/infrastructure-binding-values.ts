import { deepFreeze, isStableId } from "@relkit/contracts";
import { observeExecution } from "@relkit/runtime-effect";
import { Effect, Schema } from "effect";
import { engineTry, runEngineSync } from "./engine-runtime.js";
import { InfrastructureBindingValues } from "./infrastructure-binding-values.schemas.js";
import type { ProviderScopedValues } from "./provider-registry-types.js";

/** Environment variable containing bounded infrastructure connection-value JSON. */
export const INFRASTRUCTURE_BINDINGS_ENV = "RELKIT_INFRASTRUCTURE_BINDINGS" as const;

/** Invalid non-secret deployment input, translated to the existing TypeError boundary. */
export class InfrastructureBindingInputError extends Schema.TaggedError<InfrastructureBindingInputError>()(
  "InfrastructureBindingInputError",
  {
    message: Schema.String,
  },
) {}

/** Decode bounded deployment connection outputs, retaining stable key ordering.
 * @param value - Optional JSON environment value, limited to one MiB of characters.
 * @returns A lazy effect with frozen values or a typed safe input diagnostic.
 * @example
 * ```ts
 * const values = Effect.runSync(parseInfrastructureBindingValuesEffect('{"provider.cache":{"url":"redis://localhost"}}'));
 * ```
 */
export const parseInfrastructureBindingValuesEffect = Effect.fn("Engine.bindingValues.decode")(
  function* (value: string | undefined) {
    if (value === undefined) return undefined;
    if (value.length > 1_048_576)
      return yield* Effect.fail(
        new InfrastructureBindingInputError({
          message: "Infrastructure binding values are too large.",
        }),
      );
    const parsed = yield* engineTry(() => JSON.parse(value) as unknown).pipe(
      Effect.mapError(
        () =>
          new InfrastructureBindingInputError({
            message: "Infrastructure binding values are invalid JSON.",
          }),
      ),
    );
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return yield* Effect.fail(
        new InfrastructureBindingInputError({
          message: "Infrastructure binding values must be an object.",
        }),
      );
    const decoded = yield* Schema.decodeUnknownEffect(InfrastructureBindingValues)(parsed).pipe(
      Effect.mapError(
        () =>
          new InfrastructureBindingInputError({
            message: "Infrastructure binding output is invalid.",
          }),
      ),
    );
    const result: Record<string, Readonly<Record<string, Schema.Json>>> = {};
    for (const [bindingId, fields] of Object.entries(decoded).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (!isStableId(bindingId))
        return yield* Effect.fail(
          new InfrastructureBindingInputError({
            message: "Infrastructure binding output identity is invalid.",
          }),
        );
      const output: Record<string, Schema.Json> = {};
      for (const [field, fieldValue] of Object.entries(fields).sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        if (!isStableId(field))
          return yield* Effect.fail(
            new InfrastructureBindingInputError({
              message: "Infrastructure binding output is invalid.",
            }),
          );
        output[field] = fieldValue;
      }
      result[bindingId] = Object.freeze(output);
    }
    return deepFreeze(result);
  },
  (effect) => observeExecution("engine", "bindingValues.decode", effect),
);

/** Read deployment-provided, non-secret connection outputs.
 * @param value - Optional bounded JSON configuration.
 * @returns Sorted frozen values, or undefined when no configuration was supplied.
 * @throws TypeError when JSON, keys, or output values are invalid.
 * @see {@link parseInfrastructureBindingValuesEffect} for lazy composition.
 */
export function parseInfrastructureBindingValues(
  value: string | undefined,
): ProviderScopedValues | undefined {
  return runEngineSync(
    parseInfrastructureBindingValuesEffect(value).pipe(
      Effect.mapError((error) => new TypeError(error.message)),
    ),
  );
}
