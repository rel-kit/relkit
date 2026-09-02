import type {
  DeploymentExpression,
  DeploymentInput,
  DeploymentProgramMaterialization,
  DeploymentResourceOperation,
} from "@relkit/deploy";
import * as pulumi from "@pulumi/pulumi";

export interface ExecutedDeploymentOperations {
  readonly outputs: Readonly<Record<string, pulumi.Input<unknown>>>;
  readonly resourceCount: number;
}

class OperationResource extends pulumi.CustomResource {
  constructor(
    operation: DeploymentResourceOperation,
    inputs: pulumi.Inputs,
    options: pulumi.CustomResourceOptions,
  ) {
    for (const output of operation.outputs ?? [])
      if (!Object.prototype.hasOwnProperty.call(inputs, output)) inputs[output] = undefined;
    super(operation.type, operation.name, inputs, options);
  }
}

export function executeDeploymentOperations(
  program: DeploymentProgramMaterialization,
): ExecutedDeploymentOperations {
  const operations = operationMap(program.resources);
  const resources = new Map<string, OperationResource>();
  for (const operation of ordered(program, operations)) {
    const inputs = resolveObject(operation.inputs, program, resources);
    const parent = operation.parent === undefined ? undefined : resources.get(operation.parent);
    const dependsOn = (operation.dependsOn ?? []).map((id) => requiredResource(resources, id));
    resources.set(
      operation.id,
      new OperationResource(operation, inputs, {
        ...(parent === undefined ? {} : { parent }),
        ...(dependsOn.length === 0 ? {} : { dependsOn }),
      }),
    );
  }
  return Object.freeze({
    outputs: Object.freeze(resolveObject(program.outputs, program, resources)),
    resourceCount: resources.size,
  });
}

function ordered(
  program: DeploymentProgramMaterialization,
  operations: ReadonlyMap<string, DeploymentResourceOperation>,
): DeploymentResourceOperation[] {
  const dependencies = new Map<string, Set<string>>();
  for (const operation of operations.values()) {
    const values = new Set(operation.dependsOn ?? []);
    if (operation.parent !== undefined) values.add(operation.parent);
    collectDependencies(operation.inputs, program, values, new Set());
    values.delete(operation.id);
    for (const id of values)
      if (!operations.has(id)) throw new TypeError(`Deployment resource "${id}" is unavailable.`);
    dependencies.set(operation.id, values);
  }
  const result: DeploymentResourceOperation[] = [];
  while (result.length < operations.size) {
    const ready = [...operations.keys()]
      .filter(
        (id) =>
          !result.some((entry) => entry.id === id) &&
          [...(dependencies.get(id) ?? [])].every((dependency) =>
            result.some((entry) => entry.id === dependency),
          ),
      )
      .sort()[0];
    if (ready === undefined) throw new TypeError("Deployment resource dependency cycle detected.");
    result.push(operations.get(ready)!);
  }
  return result;
}

function collectDependencies(
  value: DeploymentInput,
  program: DeploymentProgramMaterialization,
  target: Set<string>,
  bindings: Set<string>,
): void {
  if (isExpression(value)) {
    if (value.kind === "deployment-output") target.add(value.resourceId);
    else if (value.kind === "deployment-binding") {
      const key = `${value.bindingId}\0${value.field}`;
      if (bindings.has(key)) throw new TypeError(`Deployment binding cycle detected at ${key}.`);
      const selected = program.bindings[value.bindingId]?.[value.field];
      if (selected === undefined) throw new TypeError(`Deployment binding "${key}" is unresolved.`);
      bindings.add(key);
      collectDependencies(selected, program, target, bindings);
      bindings.delete(key);
    } else if (value.kind === "deployment-join")
      value.values.forEach((entry) => collectDependencies(entry, program, target, bindings));
    else if (value.kind === "deployment-json")
      collectDependencies(value.value, program, target, bindings);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectDependencies(entry, program, target, bindings));
    return;
  }
  if (isRecord(value))
    Object.values(value).forEach((entry) =>
      collectDependencies(entry as DeploymentInput, program, target, bindings),
    );
}

function resolveInput(
  value: DeploymentInput,
  program: DeploymentProgramMaterialization,
  resources: ReadonlyMap<string, OperationResource>,
): pulumi.Input<unknown> {
  if (!isExpression(value)) {
    if (Array.isArray(value)) return value.map((entry) => resolveInput(entry, program, resources));
    if (isRecord(value)) return resolveObject(value, program, resources);
    return value;
  }
  if (value.kind === "deployment-output") {
    const resource = requiredResource(resources, value.resourceId) as unknown as Record<
      string,
      pulumi.Input<unknown>
    >;
    const output = resource[value.property];
    if (output === undefined)
      throw new TypeError(`Deployment output "${value.resourceId}.${value.property}" is missing.`);
    return output;
  }
  if (value.kind === "deployment-configuration") return configuration(value);
  if (value.kind === "deployment-binding") {
    const selected = program.bindings[value.bindingId]?.[value.field];
    if (selected === undefined)
      throw new TypeError(`Deployment binding "${value.bindingId}.${value.field}" is unresolved.`);
    return resolveInput(selected, program, resources);
  }
  if (value.kind === "deployment-join")
    return pulumi.concat(...value.values.map((entry) => resolveInput(entry, program, resources)));
  return pulumi.jsonStringify(resolveInput(value.value, program, resources));
}

function configuration(
  expression: Extract<DeploymentExpression, { readonly kind: "deployment-configuration" }>,
): pulumi.Input<unknown> {
  const separator = expression.name.indexOf(":");
  const namespace = separator < 0 ? undefined : expression.name.slice(0, separator);
  const name = separator < 0 ? expression.name : expression.name.slice(separator + 1);
  const config = new pulumi.Config(namespace);
  const value = expression.sensitive ? config.getSecret(name) : config.get(name);
  if (value !== undefined) return value;
  if (expression.fallback !== undefined) return expression.fallback;
  return expression.sensitive ? config.requireSecret(name) : config.require(name);
}

function resolveObject(
  value: Readonly<Record<string, DeploymentInput>>,
  program: DeploymentProgramMaterialization,
  resources: ReadonlyMap<string, OperationResource>,
): Record<string, pulumi.Input<unknown>> {
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [name, resolveInput(entry, program, resources)]),
  );
}

function operationMap(
  values: readonly DeploymentResourceOperation[],
): Map<string, DeploymentResourceOperation> {
  const result = new Map<string, DeploymentResourceOperation>();
  for (const value of values) {
    if (result.has(value.id)) throw new TypeError(`Duplicate deployment resource "${value.id}".`);
    result.set(value.id, value);
  }
  return result;
}

function requiredResource(
  resources: ReadonlyMap<string, OperationResource>,
  id: string,
): OperationResource {
  const resource = resources.get(id);
  if (resource === undefined) throw new TypeError(`Deployment resource "${id}" is unavailable.`);
  return resource;
}

function isExpression(value: DeploymentInput): value is DeploymentExpression {
  return isRecord(value) && typeof value.kind === "string" && value.kind.startsWith("deployment-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
