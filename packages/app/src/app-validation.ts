import { isEnvRef, type EnvDefinition, type EnvShape } from "@relkit/config";
import { normalizeId } from "@relkit/contracts";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
