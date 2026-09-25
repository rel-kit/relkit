import { isStableId } from "@relkit/contracts";
import { Effect } from "effect";
import { LocalServiceValidationFailure } from "./local-service-errors.js";
import type {
  CompositeLocalServiceRecipe,
  LocalServiceGeneratedSecret,
  LocalServiceHealthCheck,
  LocalServiceLiteralEnvironment,
  LocalServiceRecipeInput,
  LocalServiceSecretEnvironment,
} from "./recipe.types.js";

/** Produce an expected recipe validation failure within an Effect.
 * @param message - Stable compatibility message for the invalid field.
 * @returns An Effect that fails with LocalServiceValidationFailure.
 * @example yield* invalid("Local-service volume");
 */
export const invalid = (message: string): Effect.Effect<never, LocalServiceValidationFailure> =>
  Effect.fail(new LocalServiceValidationFailure({ message }));

/** Validate fields shared by both recipe versions.
 * @param recipe - Candidate recipe.
 * @returns An Effect that succeeds or fails with LocalServiceValidationFailure.
 * @example Effect.runSync(common(recipe));
 */
export const common = Effect.fn("LocalService.validateCommon")(function* (
  recipe: LocalServiceRecipeInput,
) {
  if (
    recipe === null ||
    typeof recipe !== "object" ||
    recipe.kind !== "local-service-recipe" ||
    !isStableId(recipe.integrationId) ||
    !isStableId(recipe.recipeId) ||
    recipe.materializerId !== "docker" ||
    (recipe.recipeVersion === 1 && recipe.protocolVersion !== 1) ||
    (recipe.recipeVersion === 2 && recipe.protocolVersion !== 2) ||
    (recipe.recipeVersion !== 1 && recipe.recipeVersion !== 2) ||
    typeof recipe.outputs !== "function" ||
    (recipe.initialize !== undefined && typeof recipe.initialize !== "function")
  )
    yield* invalid("Local-service recipe");
});

/** Validate generated-secret declarations.
 * @param value - Secret declarations, if any.
 * @returns An Effect that succeeds or fails with LocalServiceValidationFailure.
 * @example Effect.runSync(secrets(recipe.generatedSecrets));
 */
export const secrets = Effect.fn("LocalService.validateSecrets")(function* (
  value: Readonly<Record<string, LocalServiceGeneratedSecret>> | undefined,
) {
  if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value)))
    yield* invalid("Local-service generated secret");
  for (const [name, declaration] of Object.entries(value ?? {})) {
    if (
      !isStableId(name) ||
      declaration === null ||
      typeof declaration !== "object" ||
      !Number.isSafeInteger(declaration.bytes) ||
      declaration.bytes < 8 ||
      (declaration.encoding !== undefined &&
        declaration.encoding !== "base64url" &&
        declaration.encoding !== "hex")
    )
      yield* invalid("Local-service generated secret");
  }
});

/** Validate literal and generated-secret environment entries.
 * @param value - Environment references, if any.
 * @param declarations - Available generated-secret declarations.
 * @returns An Effect that succeeds or fails with LocalServiceValidationFailure.
 * @example Effect.runSync(environments(recipe.environment, recipe.generatedSecrets));
 */
export const environments = Effect.fn("LocalService.validateEnvironments")(function* (
  value:
    | Readonly<Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>>
    | undefined,
  declarations: Readonly<Record<string, LocalServiceGeneratedSecret>> | undefined,
) {
  if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value)))
    yield* invalid("Local-service secret environment");
  for (const [name, reference] of Object.entries(value ?? {})) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) yield* invalid("Local-service secret environment");
    if (reference === null || typeof reference !== "object")
      yield* invalid("Local-service secret environment");
    if ("value" in reference) {
      if (typeof reference.value !== "string" || /[\0\r\n]/.test(reference.value))
        yield* invalid("Local-service literal environment");
      continue;
    }
    if (!isStableId(reference.secret) || declarations?.[reference.secret] === undefined)
      yield* invalid("Local-service secret environment");
  }
});

/** Validate a container health check.
 * @param value - Health command and positive timing values.
 * @returns An Effect that succeeds or fails with LocalServiceValidationFailure.
 * @example Effect.runSync(healthCheck(recipe.health));
 */
export const healthCheck = Effect.fn("LocalService.validateHealth")(function* (
  value: LocalServiceHealthCheck,
) {
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray(value.command) ||
    value.command.length === 0 ||
    value.command.some(
      (part) => typeof part !== "string" || !/^[a-zA-Z0-9_./:=?\-]+$/.test(part),
    ) ||
    !Number.isSafeInteger(value.intervalMs) ||
    value.intervalMs < 1 ||
    !Number.isSafeInteger(value.timeoutMs) ||
    value.timeoutMs < 1 ||
    !Number.isSafeInteger(value.retries) ||
    value.retries < 1
  )
    yield* invalid("Local-service health check");
});

/** Trim a string candidate without coercing untrusted values.
 * @param value - Candidate image name or other text.
 * @returns An Effect containing trimmed text or an empty string.
 * @example Effect.runSync(text(" api "));
 */
export const text = Effect.fn("LocalService.text")(function* (value: unknown) {
  return typeof value === "string" ? value.trim() : "";
});

/** Check an absolute volume path.
 * @param value - Candidate mount path.
 * @returns An Effect containing whether the path is valid.
 * @example Effect.runSync(path("/data"));
 */
export const path = Effect.fn("LocalService.path")(function* (value: unknown) {
  return typeof value === "string" && /^\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..");
});

/** Validate composite recipe container settings.
 * @param recipe - Composite recipe candidate.
 * @returns An Effect that succeeds or fails with LocalServiceValidationFailure.
 * @example Effect.runSync(assertComposite(recipe));
 */
export const assertComposite = Effect.fn("LocalService.validateComposite")(function* (
  recipe: CompositeLocalServiceRecipe,
) {
  if (!recipe.volumes || typeof recipe.volumes !== "object" || Array.isArray(recipe.volumes))
    yield* invalid("Local-service volumes");
  if (
    recipe.network !== undefined &&
    (typeof recipe.network !== "object" ||
      recipe.network === null ||
      Array.isArray(recipe.network) ||
      (typeof recipe.network.internal !== "undefined" &&
        typeof recipe.network.internal !== "boolean"))
  )
    yield* invalid("Local-service network");
  if (
    recipe.ownership !== undefined &&
    (typeof recipe.ownership !== "object" ||
      recipe.ownership === null ||
      !["project", "binding"].includes(recipe.ownership.scope) ||
      (recipe.ownership.retainVolumes !== undefined &&
        typeof recipe.ownership.retainVolumes !== "boolean"))
  )
    yield* invalid("Local-service ownership");
});
