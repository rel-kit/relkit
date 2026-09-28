import { isEnvRef, type EnvDefinition, type EnvShape } from "@relkit/config";
import { normalizeId } from "@relkit/contracts";
import { Effect, Result, Schema } from "effect";
import { observeApp } from "./app-observability.js";
import type { AppCompatibilityConfig } from "./define-app.types.js";

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

/** Normalizes the legacy jobs compatibility flag in Effect.
 * @param value - Optional compatibility configuration.
 * @returns A frozen flag object or AppValidationFailure.
 * @example Effect.runSync(normalizeCompatibilityEffect({ legacyJobs: true }));
 */
export const normalizeCompatibilityEffect = Effect.fn("App.normalizeCompatibility")(
  (value: AppCompatibilityConfig | undefined) =>
    observeApp(
      "compatibility.normalize",
      Effect.try({
        try: () => {
          if (value === undefined) return Object.freeze({ legacyJobs: false });
          if (
            !isRecord(value) ||
            (value.legacyJobs !== undefined && typeof value.legacyJobs !== "boolean")
          )
            throw new TypeError("defineApp compatibility.legacyJobs must be a boolean");
          return Object.freeze({ legacyJobs: value.legacyJobs === true });
        },
        catch: validationFailure,
      }),
    ),
);

/** Synchronous compatibility normalizer.
 * @param value - Optional compatibility configuration.
 * @returns A frozen legacy-jobs flag object.
 * @throws TypeError for an invalid compatibility flag.
 * @example normalizeCompatibility({ legacyJobs: true });
 */
export function normalizeCompatibility(value: AppCompatibilityConfig | undefined): {
  readonly legacyJobs: boolean;
} {
  return runValidation(normalizeCompatibilityEffect(value));
}

/** Rejects simultaneous current and legacy aliases in Effect.
 * @param value - Record containing optional aliases.
 * @param primary - Current alias name.
 * @param legacy - Legacy alias name.
 * @param label - Diagnostic context.
 * @returns Void or AppValidationFailure.
 * @example Effect.runSync(assertExclusiveAliasEffect(options, "jobs", "job", "defineApp"));
 */
export const assertExclusiveAliasEffect = Effect.fn("App.assertExclusiveAlias")(
  (value: Record<string, unknown>, primary: string, legacy: string, label: string) =>
    observeApp(
      "alias.assertExclusive",
      Effect.try({
        try: () => {
          if (value[primary] !== undefined && value[legacy] !== undefined)
            throw new TypeError(`${label} cannot specify both "${primary}" and "${legacy}"`);
        },
        catch: validationFailure,
      }),
    ),
);

/** Synchronous alias exclusivity adapter.
 * @param value - Record containing optional aliases.
 * @param primary - Current alias name.
 * @param legacy - Legacy alias name.
 * @param label - Diagnostic context.
 * @returns Nothing when aliases are exclusive.
 * @throws TypeError when both aliases are present.
 * @example assertExclusiveAlias(options, "jobs", "job", "defineApp");
 */
export function assertExclusiveAlias(
  value: Record<string, unknown>,
  primary: string,
  legacy: string,
  label: string,
): void {
  runValidation(assertExclusiveAliasEffect(value, primary, legacy, label));
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
