import { ModelProviderRegistryError } from "./model-provider-registry-errors.js";

export function resolveValue(
  value: unknown,
  values: Readonly<Record<string, unknown>> | undefined,
  path: string,
): unknown {
  if (isEnvRef(value)) {
    if (
      values === undefined ||
      !Object.hasOwn(values, value.name) ||
      values[value.name] === undefined
    )
      throw new ModelProviderRegistryError(
        "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID",
        `${path} environment reference is unresolved.`,
      );
    return values[value.name];
  }
  if (isSensitiveMarker(value)) {
    throw new ModelProviderRegistryError(
      "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID",
      `${path} contains an unresolved secret.`,
    );
  }
  if (Array.isArray(value))
    return value.map((entry, index) => resolveValue(entry, values, `${path}[${index}]`));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveValue(entry, values, `${path}.${key}`),
      ]),
    );
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEnvRef(value: unknown): value is { readonly kind: "env-ref"; readonly name: string } {
  return (
    isRecord(value) &&
    value.kind === "env-ref" &&
    typeof value.name === "string" &&
    value.name.trim() !== ""
  );
}

function isSensitiveMarker(value: unknown): boolean {
  return isRecord(value) && value.kind === "sensitive-configuration";
}
