import { randomBytes } from "node:crypto";
import { isStableId, serializeJson, type JsonValue } from "@relkit/contracts";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  LOCAL_SERVICE_PROTOCOL_VERSION,
  type LocalServiceInstance,
  type LocalServicePlanEntry,
  type LocalServiceRecipe,
} from "@relkit/local-service";
import { LOCAL_RESOURCE_LABEL } from "./identity.js";
import type { ProviderOverrideState } from "@relkit/local-service";
import type { LocalServiceReconcileRequest } from "./reconciler-types.js";

export function desiredServices(
  request: LocalServiceReconcileRequest,
): readonly LocalServicePlanEntry[] {
  if (
    request.plan.version !== LOCAL_SERVICE_PLAN_VERSION ||
    !hash(request.plan.graphHash) ||
    !hash(request.planHash) ||
    !Array.isArray(request.plan.services)
  ) {
    invalid();
  }
  return request.plan.services
    .filter((entry) => request.scope === "all" || entry.requiredBy.length > 0)
    .sort((left, right) => left.bindingId.localeCompare(right.bindingId));
}

export function recipeFor(
  entry: LocalServicePlanEntry,
  recipes: Readonly<Record<string, LocalServiceRecipe>>,
  materializerId: string,
): LocalServiceRecipe {
  const recipe = recipes[entry.recipe.integrationId];
  if (
    recipe?.kind !== "local-service-recipe" ||
    recipe.protocolVersion !== LOCAL_SERVICE_PROTOCOL_VERSION ||
    recipe.integrationId !== entry.recipe.integrationId ||
    recipe.recipeId !== entry.recipe.recipeId ||
    recipe.recipeVersion !== entry.recipe.recipeVersion ||
    recipe.materializerId !== entry.materializerId ||
    recipe.materializerId !== materializerId
  ) {
    invalid();
  }
  return recipe;
}

export function serviceSignature(entry: LocalServicePlanEntry): string {
  return serializeJson({
    materializerId: entry.materializerId,
    recipe: entry.recipe,
    configuration: entry.configuration,
  });
}

export function generatedSecrets(
  recipe: LocalServiceRecipe,
  previous: ProviderOverrideState | undefined,
  bindingId: string,
  retained?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  const declarations = Object.entries(recipe.generatedSecrets ?? {});
  if (declarations.length === 0) return Object.freeze({});
  const values = previous?.bindings.find((binding) => binding.bindingId === bindingId)?.values;
  const restored: Record<string, string> = {};
  for (const [name] of declarations) {
    const value = retained?.[name] ?? values?.[name];
    if (typeof value !== "string" || value === "") return undefined;
    restored[name] = value;
  }
  return Object.freeze(restored);
}

export function createSecrets(recipe: LocalServiceRecipe): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, declaration] of Object.entries(recipe.generatedSecrets ?? {})) {
    if (!isStableId(name) || !Number.isSafeInteger(declaration.bytes) || declaration.bytes < 8) {
      invalid();
    }
    result[name] = randomBytes(declaration.bytes).toString("base64url");
  }
  return Object.freeze(result);
}

export function environmentFile(
  recipe: LocalServiceRecipe,
  secrets: Readonly<Record<string, string>>,
): string | undefined {
  const entries = Object.entries(recipe.environment ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return undefined;
  return `${entries
    .map(([name, reference]) => {
      const value = secrets[reference.secret];
      if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof value !== "string" || /[\0\r\n]/.test(value)) {
        invalid();
      }
      return `${name}=${value}`;
    })
    .join("\n")}\n`;
}

export function outputPorts(
  recipe: LocalServiceRecipe,
  instance: LocalServiceInstance,
): Readonly<Record<string, number>> {
  const ports: Record<string, number> = {};
  for (const [name, containerPort] of Object.entries(recipe.ports)) {
    const value = instance.ports[name] ?? instance.ports[`${containerPort}/tcp`];
    if (typeof value !== "number") invalid();
    ports[name] = value;
  }
  return Object.freeze(ports);
}

export function compatible(
  instance: LocalServiceInstance,
  expectedRecipe: string,
  planHash: string,
  priorSignature: string | undefined,
  signature: string,
): boolean {
  return (
    instance.health === "healthy" &&
    instance.labels[LOCAL_RESOURCE_LABEL.recipeId] === expectedRecipe &&
    (instance.labels[LOCAL_RESOURCE_LABEL.planHash] === planHash || priorSignature === signature)
  );
}

export function sameBindings(
  previous: ProviderOverrideState | undefined,
  planHash: string,
  bindings: readonly {
    readonly bindingId: string;
    readonly values: Readonly<Record<string, JsonValue>>;
  }[],
): boolean {
  return (
    previous?.planHash === planHash && serializeJson(previous.bindings) === serializeJson(bindings)
  );
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function invalid(): never {
  throw new Error("Local service recipe or plan is invalid.");
}
