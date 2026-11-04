import { isEnvRef, type EnvDefinition, type EnvShape } from "../config/index.js";
import { normalizeId } from "../contracts/index.js";
import { Effect, Result, Schema } from "effect";
import { observeApp } from "./app-observability.js";

/** Expected invalid application input with the original cause preserved.
 * @example if (error._tag === "AppValidationFailure") console.error(error.message);
 */
export class AppValidationFailure extends Schema.TaggedError<AppValidationFailure>()(
  "AppValidationFailure",
  { message: Schema.String, cause: Schema.Defect() },
) {}

/** Checks the complete environment descriptor shape in Effect.
 * @param value - Candidate environment descriptor.
 * @returns True for a valid environment definition; no expected failure.
 * @example Effect.runSync(isEnvDefinitionEffect(value));
 */
export const isEnvDefinitionEffect = Effect.fn("App.isEnvDefinition")((value: unknown) =>
  observeApp(
    "env.isDefinition",
    Effect.sync(() => {
      if (!isRecord(value) || value.kind !== "env-definition" || !isRecord(value.shape))
        return false;
      return Object.entries(value.shape).every(([name, builder]) => {
        const reference = value[name];
        return (
          isRecord(builder) &&
          builder.kind === "env-builder" &&
          typeof builder.parse === "function" &&
          typeof builder.getDefault === "function" &&
          isEnvRef(reference) &&
          reference.name === name
        );
      });
    }),
  ),
);

/** Synchronous environment descriptor guard.
 * @param value - Candidate environment descriptor.
 * @returns True for a valid environment definition.
 * @example if (isEnvDefinition(value)) console.log(value.shape);
 */
export function isEnvDefinition(value: unknown): value is EnvDefinition<EnvShape> {
  return Effect.runSync(isEnvDefinitionEffect(value));
}

/** Derives an application ID from a package name in Effect.
 * @param packageName - Scoped or unscoped package name.
 * @returns A normalized ID or AppValidationFailure.
 * @example Effect.runSync(deriveApplicationIdEffect("@acme/orders"));
 */
export const deriveApplicationIdEffect = Effect.fn("App.deriveApplicationId")(
  (packageName: string) =>
    observeApp(
      "id.derive",
      Effect.try({
        try: () =>
          normalizeId(
            (packageName.startsWith("@") ? packageName.slice(1) : packageName).replaceAll("/", "."),
          ),
        catch: validationFailure,
      }),
    ),
);

/** Synchronous package-name ID adapter.
 * @param packageName - Scoped or unscoped package name.
 * @returns A normalized application ID.
 * @throws The original normalization error for invalid input.
 * @example deriveApplicationId("@acme/orders");
 */
export function deriveApplicationId(packageName: string): string {
  return runValidation(deriveApplicationIdEffect(packageName));
}

/** Maps known synchronous validation errors into the typed channel. */
function validationFailure(cause: unknown): AppValidationFailure {
  return new AppValidationFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

/** Runs a pure validation Effect while preserving old thrown errors. */
function runValidation<A>(effect: Effect.Effect<A, AppValidationFailure>): A {
  const result = Effect.runSync(Effect.result(effect));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}

/** Tests for a non-array object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
