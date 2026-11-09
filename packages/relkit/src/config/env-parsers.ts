import { Effect } from "effect";
import { observeConfig, runConfigSync } from "./config-observability.js";
import { ConfigValidationError } from "./config-validation-error.js";
import type { LiteralValue } from "./env.types.js";

/** Parse a finite number from an environment string.
 * @param value - Raw environment value.
 * @returns Effect with a finite number or ConfigValidationError.
 * @example Effect.runSync(parseNumberEffect("42"));
 */
export function parseNumberEffect(value: string): Effect.Effect<number, ConfigValidationError> {
  return observeConfig(
    "parse-number",
    Effect.gen(function* () {
      const parsed = Number(value.trim());
      if (value.trim() === "" || !Number.isFinite(parsed)) {
        return yield* Effect.fail(
          new ConfigValidationError({ message: "Expected a finite number" }),
        );
      }
      return parsed;
    }),
  );
}

/** Parse a finite number synchronously.
 * @param value - Raw environment value.
 * @returns The parsed number.
 * @throws TypeError when the value is not finite.
 * @example parseNumber("42");
 */
export function parseNumber(value: string): number {
  return runConfigSync(parseNumberEffect(value));
}

/** Parse a TCP port from an environment string.
 * @param value - Raw environment value.
 * @returns Effect with a port or ConfigValidationError.
 * @example Effect.runSync(parsePortEffect("3000"));
 */
export function parsePortEffect(value: string): Effect.Effect<number, ConfigValidationError> {
  return observeConfig(
    "parse-port",
    Effect.gen(function* () {
      const parsed = yield* parseNumberEffect(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return yield* Effect.fail(
          new ConfigValidationError({ message: "Expected a port from 1 through 65535" }),
        );
      }
      return parsed;
    }),
  );
}

/** Parse a TCP port synchronously.
 * @param value - Raw environment value.
 * @returns Port from 1 through 65535.
 * @throws TypeError for an invalid port.
 * @example parsePort("3000");
 */
export function parsePort(value: string): number {
  return runConfigSync(parsePortEffect(value));
}

/** Parse an exact Boolean environment token.
 * @param value - Raw environment value.
 * @returns Effect with a Boolean or ConfigValidationError.
 * @example Effect.runSync(parseBooleanEffect("true"));
 */
export function parseBooleanEffect(value: string): Effect.Effect<boolean, ConfigValidationError> {
  return observeConfig(
    "parse-boolean",
    Effect.gen(function* () {
      if (value === "true") return true;
      if (value === "false") return false;
      return yield* Effect.fail(new ConfigValidationError({ message: "Expected true or false" }));
    }),
  );
}

/** Parse an exact Boolean synchronously.
 * @param value - Raw environment value.
 * @returns Parsed Boolean.
 * @throws TypeError for any other token.
 * @example parseBoolean("false");
 */
export function parseBoolean(value: string): boolean {
  return runConfigSync(parseBooleanEffect(value));
}

/** Match a raw value against declared literal choices.
 * @param value - Raw environment value.
 * @param values - Allowed choices in declaration order.
 * @returns Effect with the matching literal or ConfigValidationError.
 * @example Effect.runSync(parseLiteralEffect("test", ["test", "prod"]));
 */
export function parseLiteralEffect<T extends LiteralValue>(
  value: string,
  values: readonly T[],
): Effect.Effect<T, ConfigValidationError> {
  return observeConfig(
    "parse-literal",
    Effect.gen(function* () {
      const match = values.find((expected) => String(expected) === value);
      if (match === undefined) {
        return yield* Effect.fail(
          new ConfigValidationError({ message: `Expected one of: ${values.join(", ")}` }),
        );
      }
      return match;
    }),
  );
}

/** Match a literal synchronously.
 * @param value - Raw environment value.
 * @param values - Allowed choices in declaration order.
 * @returns The declared literal.
 * @throws TypeError when there is no match.
 * @example parseLiteral("test", ["test", "prod"]);
 */
export function parseLiteral<T extends LiteralValue>(value: string, values: readonly T[]): T {
  return runConfigSync(parseLiteralEffect(value, values));
}
