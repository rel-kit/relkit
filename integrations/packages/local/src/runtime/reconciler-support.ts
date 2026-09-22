import { randomBytes } from "node:crypto";
import { isStableId, serializeJson } from "@relkit/contracts";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  LOCAL_SERVICE_PROTOCOL_VERSION,
  normalizeLocalServiceRecipe,
  type LocalServiceInstance,
  type LocalServicePlanEntry,
  type LocalServiceRecipeInput,
  type ProviderOverrideState,
} from "@relkit/local-service";
import { LOCAL_RESOURCE_LABEL } from "./identity.js";
import type { LocalServiceReconcileRequest } from "./reconciler-types.js";
import { completeUnits, hash, invalid } from "./reconciler-support-validation.js";

export { sameBindings } from "./reconciler-support-validation.js";

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
  recipes: Readonly<Record<string, LocalServiceRecipeInput>>,
  materializerId: string,
): LocalServiceRecipeInput {
  const recipe = recipes[entry.recipe.integrationId];
  if (
    recipe?.kind !== "local-service-recipe" ||
    recipe.protocolVersion !== (recipe.recipeVersion === 2 ? 2 : LOCAL_SERVICE_PROTOCOL_VERSION) ||
    recipe.integrationId !== entry.recipe.integrationId ||
    recipe.recipeId !== entry.recipe.recipeId ||
    recipe.recipeVersion !== entry.recipe.recipeVersion ||
    recipe.materializerId !== entry.materializerId ||
    recipe.materializerId !== materializerId
  ) {
    invalid();
  }
  normalizeLocalServiceRecipe(recipe);
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
  recipe: LocalServiceRecipeInput,
  previous: ProviderOverrideState | undefined,
  bindingId: string,
  retained?: Readonly<Record<string, string>>,
  persisted?: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> | undefined {
  const declarations = Object.entries(normalizeLocalServiceRecipe(recipe).generatedSecrets);
  if (declarations.length === 0) return Object.freeze({});
  const values = previous?.bindings.find((binding) => binding.bindingId === bindingId)?.values;
  const restored: Record<string, string> = {};
  for (const [name] of declarations) {
    const value = retained?.[name] ?? persisted?.[name] ?? values?.[name];
    if (typeof value !== "string" || value === "") return undefined;
    restored[name] = value;
  }
  return Object.freeze(restored);
}

export function createSecrets(recipe: LocalServiceRecipeInput): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, declaration] of Object.entries(
    normalizeLocalServiceRecipe(recipe).generatedSecrets,
  )) {
    if (!isStableId(name) || !Number.isSafeInteger(declaration.bytes) || declaration.bytes < 8) {
      invalid();
    }
    result[name] = randomBytes(declaration.bytes).toString(declaration.encoding ?? "base64url");
  }
  return Object.freeze(result);
}

export function outputPorts(
  recipe: LocalServiceRecipeInput,
  instance: LocalServiceInstance,
): Readonly<Record<string, number>> {
  const normalized = normalizeLocalServiceRecipe(recipe);
  if (normalized.recipeVersion === 2) {
    const ports: Record<string, number> = {};
    for (const unit of normalized.units) {
      const child = instance.units?.find((candidate) => candidate.unitId === unit.id);
      if (child === undefined) continue;
      for (const [name, containerPort] of Object.entries(unit.ports)) {
        const value = child.ports[name] ?? child.ports[`${containerPort}/tcp`];
        if (typeof value !== "number") invalid();
        ports[`${unit.id}.${name}`] = value;
        if (!Object.hasOwn(ports, name)) ports[name] = value;
      }
    }
    return Object.freeze(ports);
  }
  const ports: Record<string, number> = {};
  const legacy = recipe as Extract<LocalServiceRecipeInput, { readonly image: string }>;
  for (const [name, containerPort] of Object.entries(legacy.ports)) {
    const value = instance.ports[name] ?? instance.ports[`${containerPort}/tcp`];
    if (typeof value !== "number") invalid();
    ports[name] = value;
  }
  return Object.freeze(ports);
}

export function groupServiceInstances(
  instances: readonly LocalServiceInstance[],
): readonly LocalServiceInstance[] {
  const groups = new Map<string, LocalServiceInstance[]>();
  const singles: LocalServiceInstance[] = [];
  for (const instance of instances) {
    const bindingId = instance.labels[LOCAL_RESOURCE_LABEL.bindingId];
    const unitId = instance.labels["dev.relkit.unit-id"];
    if (bindingId === undefined || unitId === undefined) singles.push(instance);
    else {
      const enriched = instance.unitId === unitId ? instance : { ...instance, unitId };
      const key = [
        bindingId,
        instance.labels[LOCAL_RESOURCE_LABEL.environment] ?? "",
        instance.labels[LOCAL_RESOURCE_LABEL.serviceGeneration] ?? "",
        instance.labels[LOCAL_RESOURCE_LABEL.recipeId] ?? "",
      ].join("\0");
      groups.set(key, [...(groups.get(key) ?? []), enriched]);
    }
  }
  const composite = [...groups.values()].map((units) => {
    const first = units[0]!;
    const health = units.some((unit) => unit.health === "unhealthy")
      ? ("unhealthy" as const)
      : units.every((unit) => unit.health === "healthy")
        ? ("healthy" as const)
        : ("starting" as const);
    const ports = Object.assign({}, ...units.map((unit) => unit.ports));
    const grouped = {
      ...first,
      ports: Object.freeze(ports),
      units: Object.freeze(units),
      ...(first.labels[LOCAL_RESOURCE_LABEL.environment] === undefined
        ? {}
        : { environment: first.labels[LOCAL_RESOURCE_LABEL.environment] }),
      ...(first.labels[LOCAL_RESOURCE_LABEL.serviceGeneration] === undefined
        ? {}
        : { serviceGeneration: first.labels[LOCAL_RESOURCE_LABEL.serviceGeneration] }),
    } satisfies LocalServiceInstance;
    return Object.freeze({ ...grouped, health });
  });
  return Object.freeze([...singles, ...composite]);
}

export function serviceInstanceIds(instance: LocalServiceInstance): readonly string[] {
  return Object.freeze(
    [instance.id, ...(instance.units ?? []).map((unit) => unit.id)].filter(
      (id, index, values) => values.indexOf(id) === index,
    ),
  );
}

export function compatible(
  instance: LocalServiceInstance,
  expectedRecipe: string,
  planHash: string,
  priorSignature: string | undefined,
  signature: string,
  environment?: string,
  serviceGeneration?: string,
  expectedUnitIds?: readonly string[],
  endpointHash?: string,
): boolean {
  return (
    instance.health === "healthy" &&
    instance.labels[LOCAL_RESOURCE_LABEL.recipeId] === expectedRecipe &&
    (environment === undefined ||
      instance.labels[LOCAL_RESOURCE_LABEL.environment] === environment) &&
    (serviceGeneration === undefined ||
      instance.labels[LOCAL_RESOURCE_LABEL.serviceGeneration] === serviceGeneration) &&
    (expectedUnitIds === undefined || completeUnits(instance, expectedUnitIds)) &&
    (endpointHash === undefined ||
      instance.labels[LOCAL_RESOURCE_LABEL.endpointHash] === endpointHash) &&
    (instance.labels[LOCAL_RESOURCE_LABEL.planHash] === planHash || priorSignature === signature)
  );
}
