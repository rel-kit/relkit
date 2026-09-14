import { isEnvRef, type EnvDefinition, type EnvShape } from "@relkit/config";
import { normalizeId } from "@relkit/contracts";
import type { AppCompatibilityConfig } from "./define-app-types.js";

export function isEnvDefinition(value: unknown): value is EnvDefinition<EnvShape> {
  if (!isRecord(value) || value.kind !== "env-definition" || !isRecord(value.shape)) return false;
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
}

export function deriveApplicationId(packageName: string): string {
  const normalized = packageName.startsWith("@") ? packageName.slice(1) : packageName;
  return normalizeId(normalized.replaceAll("/", "."));
}

export function normalizeCompatibility(
  value: AppCompatibilityConfig | undefined,
): { readonly legacyJobs: boolean } {
  if (value === undefined) return Object.freeze({ legacyJobs: false });
  if (!isRecord(value) || (value.legacyJobs !== undefined && typeof value.legacyJobs !== "boolean")) {
    throw new TypeError("defineApp compatibility.legacyJobs must be a boolean");
  }
  return Object.freeze({ legacyJobs: value.legacyJobs === true });
}

export function assertExclusiveAlias(
  value: Record<string, unknown>,
  primary: string,
  legacy: string,
  label: string,
): void {
  if (value[primary] !== undefined && value[legacy] !== undefined) {
    throw new TypeError(`${label} cannot specify both "${primary}" and "${legacy}"`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
