import type { RawRouteOptions } from "./route-types.js";

export interface BetterAuthRegistration {
  readonly kind: "better-auth";
  readonly service: { readonly ref: { readonly kind: "service"; readonly id: string } };
}

export function readBetterAuthRegistration(
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

export function copyProtectedPaths(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return Object.freeze([]);
  if (!Array.isArray(values)) throw new TypeError("Protected route patterns must be an array");
  return Object.freeze([...new Set(values.map(validateProtectedPattern))].sort());
}

function validateProtectedPattern(value: string): string {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
    throw new TypeError(`Invalid protected route pattern "${value}"`);
  }
  if (value.includes("*") && !value.endsWith("/*")) {
    throw new TypeError(`Protected route wildcard must end the pattern: "${value}"`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
