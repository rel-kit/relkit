import {
  deploymentBinding,
  deploymentConfiguration,
  deploymentJson,
  type DeploymentInput,
  type DeploymentPlan,
} from "@relkit/deploy";

export function containerEnvironment(
  plan: DeploymentPlan,
): readonly Readonly<{ name: string; value: DeploymentInput }>[] {
  const environment = new Map<string, DeploymentInput>([
    ["RELKIT_APPLICATION_ID", plan.application.id],
  ]);
  for (const name of plan.application.environmentNames)
    environment.set(name, deploymentConfiguration(name));
  for (const binding of plan.connectedBindings)
    for (const value of binding.namedValues)
      environment.set(
        value.name,
        deploymentConfiguration(value.name, { sensitive: value.sensitive }),
      );
  const infrastructure = Object.fromEntries(
    plan.infrastructureOperations.map((binding) => [
      binding.bindingId,
      Object.fromEntries(
        Object.keys(record(binding.adapter.connectionContract))
          .sort()
          .map((field) => [field, deploymentBinding(binding.bindingId, field)]),
      ),
    ]),
  );
  if (Object.keys(infrastructure).length > 0)
    environment.set("RELKIT_INFRASTRUCTURE_BINDINGS", deploymentJson(infrastructure));
  return [...environment]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({ name, value }));
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
