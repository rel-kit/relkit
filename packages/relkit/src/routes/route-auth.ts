import type { RawRouteOptions } from "./route.types.js";
import { Effect } from "effect";
import type { BetterAuthRegistration } from "./route-auth.types.js";
import { routeTry, runRouteSync } from "./route-observability.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
