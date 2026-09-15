import { isStableId } from "@relkit/contracts";
import type {
  CompositeLocalServiceRecipe,
  LocalServiceGeneratedSecret,
  LocalServiceHealthCheck,
  LocalServiceLiteralEnvironment,
  LocalServiceRecipeInput,
  LocalServiceSecretEnvironment,
} from "./recipe.js";

export function common(recipe: LocalServiceRecipeInput): void {
  if (
    recipe === null || typeof recipe !== "object" ||
    recipe.kind !== "local-service-recipe" ||
    !isStableId(recipe.integrationId) ||
    !isStableId(recipe.recipeId) ||
    recipe.materializerId !== "docker" ||
    (recipe.recipeVersion === 1 && recipe.protocolVersion !== 1) ||
    (recipe.recipeVersion === 2 && recipe.protocolVersion !== 2) ||
    (recipe.recipeVersion !== 1 && recipe.recipeVersion !== 2)
  ) invalid("Local-service recipe");
}

export function secrets(value: Readonly<Record<string, LocalServiceGeneratedSecret>> | undefined): void {
  for (const [name, declaration] of Object.entries(value ?? {})) {
    if (
      !isStableId(name) || declaration === null || typeof declaration !== "object" ||
      !Number.isSafeInteger(declaration.bytes) || declaration.bytes < 8
    ) invalid("Local-service generated secret");
  }
}

export function environments(
  value: Readonly<Record<string, LocalServiceSecretEnvironment | LocalServiceLiteralEnvironment>> | undefined,
  declarations: Readonly<Record<string, LocalServiceGeneratedSecret>> | undefined,
): void {
  for (const [name, reference] of Object.entries(value ?? {})) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) invalid("Local-service secret environment");
    if (reference === null || typeof reference !== "object") invalid("Local-service secret environment");
    if ("value" in reference) {
      if (typeof reference.value !== "string" || /[\0\r\n]/.test(reference.value)) invalid("Local-service literal environment");
      continue;
    }
    if (!isStableId(reference.secret) || declarations?.[reference.secret] === undefined) invalid("Local-service secret environment");
  }
}

export function healthCheck(value: LocalServiceHealthCheck): void {
  if (
    value.command.length === 0 ||
    value.command.some((part) => typeof part !== "string" || !/^[a-zA-Z0-9_./:=?\-]+$/.test(part)) ||
    !Number.isSafeInteger(value.intervalMs) || value.intervalMs < 1 ||
    !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 1 ||
    !Number.isSafeInteger(value.retries) || value.retries < 1
  ) invalid("Local-service health check");
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function path(value: unknown): value is string {
  return typeof value === "string" && /^\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..");
}

export function invalid(message: string): never {
  throw new TypeError(message);
}

export function assertComposite(recipe: CompositeLocalServiceRecipe): void {
  if (!recipe.volumes || typeof recipe.volumes !== "object" || Array.isArray(recipe.volumes)) invalid("Local-service volumes");
  if (recipe.network !== undefined && (typeof recipe.network !== "object" || recipe.network === null || typeof recipe.network.internal !== "undefined" && typeof recipe.network.internal !== "boolean")) invalid("Local-service network");
  if (recipe.ownership !== undefined && (typeof recipe.ownership !== "object" || recipe.ownership === null || !["project", "binding"].includes(recipe.ownership.scope) || (recipe.ownership.retainVolumes !== undefined && typeof recipe.ownership.retainVolumes !== "boolean"))) invalid("Local-service ownership");
}
