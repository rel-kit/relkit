import type { RawRouteOptions } from "./route.types.js";
import { Effect } from "effect";
import type { BetterAuthRegistration } from "./route-auth.types.js";
import { RouteInputError, routeTry, runRouteSync } from "./route-observability.js";

export type { BetterAuthRegistration } from "./route-auth.types.js";

/** Reads a Better Auth handler registration through Effect.
 * @param handler - Raw route handler.
 * @returns Registration when present, or a tagged failure for invalid input.
 * @example Effect.runSync(readBetterAuthRegistrationEffect(handler));
 */
export const readBetterAuthRegistrationEffect = Effect.fn("routes.auth.read-registration")(
  (handler: RawRouteOptions<string>["handler"]) =>
    routeTry("auth.read-registration", () => readRegistrationValue(handler)),
);

/** Reads a Better Auth handler registration synchronously.
 * @param handler - Raw route handler.
 * @returns Registration when present.
 * @throws TypeError for malformed handler input.
 * @example readBetterAuthRegistration(handler);
 */
export function readBetterAuthRegistration(
  handler: RawRouteOptions<string>["handler"],
): BetterAuthRegistration | undefined {
  return runRouteSync(readBetterAuthRegistrationEffect(handler));
}

/** Reads registration metadata inside an already observed operation.
 * @param handler - Raw route handler.
 * @returns A valid registration or undefined.
 * @example readRegistrationValue(handler);
 */
export function readRegistrationValue(
  handler: RawRouteOptions<string>["handler"],
): BetterAuthRegistration | undefined {
  const value = (handler as unknown as Record<PropertyKey, unknown>)[
    Symbol.for("relkit.better-auth.handler")
  ];
  return isRecord(value) &&
    value.kind === "better-auth" &&
    isRecord(value.service) &&
    isRecord(value.service.ref) &&
    value.service.ref.kind === "service" &&
    typeof value.service.ref.id === "string"
    ? { kind: "better-auth", service: value.service as BetterAuthRegistration["service"] }
    : undefined;
}

/** Validates and copies protected paths through Effect.
 * @param values - Optional protected route patterns.
 * @returns Sorted, frozen unique patterns or a tagged invalid-input failure.
 * @example Effect.runSync(copyProtectedPathsEffect(["/admin/*"]));
 */
export const copyProtectedPathsEffect = Effect.fn("routes.auth.copy-protected")(
  (values: readonly string[] | undefined) =>
    routeTry("auth.copy-protected", () => copyProtectedValues(values)),
);

/** Validates and copies protected route patterns synchronously.
 * @param values - Optional protected route patterns.
 * @returns Sorted, frozen unique patterns.
 * @throws TypeError for invalid patterns.
 * @example copyProtectedPaths(["/admin/*"]);
 */
export function copyProtectedPaths(values: readonly string[] | undefined): readonly string[] {
  return runRouteSync(copyProtectedPathsEffect(values));
}

/** Copies protected paths inside an already observed operation.
 * @param values - Optional protected path patterns.
 * @returns Frozen, sorted, unique paths.
 * @throws RouteInputError for an invalid pattern.
 * @example copyProtectedValues(["/admin/*"]);
 */
export function copyProtectedValues(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return Object.freeze([]);
  if (!Array.isArray(values))
    throw new RouteInputError("Protected route patterns must be an array");
  return Object.freeze([...new Set(values.map(validateProtectedPattern))].sort());
}

function validateProtectedPattern(value: string): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new RouteInputError(`Invalid protected route pattern "${value}"`);
  }
  if (value.includes("*") && !value.endsWith("/*")) {
    throw new RouteInputError(`Protected route wildcard must end the pattern: "${value}"`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
