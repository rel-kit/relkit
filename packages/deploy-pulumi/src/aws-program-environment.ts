import * as pulumi from "@pulumi/pulumi";
import type {
  RelkitBuckets,
  RelkitCaches,
  RelkitEventBus,
  RelkitJobQueues,
} from "@relkit/cloud-aws";
import type { DeploymentPlan, ProviderDeploymentPlan } from "@relkit/deploy";

export interface ManagedEnvironmentResources {
  readonly jobs: RelkitJobQueues;
  readonly events: RelkitEventBus;
  readonly buckets: RelkitBuckets;
  readonly caches: RelkitCaches;
}

export function managedEnvironment(
  plan: DeploymentPlan,
  resources: ManagedEnvironmentResources,
  region: pulumi.Input<string>,
): Record<string, pulumi.Input<string>> {
  const environment: Record<string, pulumi.Input<string>> = {};
  for (const entry of plan.buckets) {
    const binding = bindingFor(plan, entry.bindingId);
    const bucket = resources.buckets.buckets.find(({ id }) => id === entry.id);
    if (bucket === undefined) continue;
    assign(environment, reference(binding, "bucketName"), bucket.name);
    assign(environment, reference(binding, "region"), region);
    assign(
      environment,
      reference(binding, "endpoint"),
      pulumi.interpolate`https://s3.${region}.amazonaws.com`,
    );
  }
  for (const entry of plan.caches) {
    const binding = bindingFor(plan, entry.bindingId);
    const cache = resources.caches.caches.find(({ id }) => id === entry.id);
    if (cache !== undefined) assign(environment, reference(binding, "url"), cache.url);
  }
  for (const entry of plan.jobs) {
    const binding = bindingFor(plan, entry.bindingId);
    const queue = resources.jobs.queues.find(({ id }) => id === entry.id);
    if (queue !== undefined) assign(environment, reference(binding, "queueUrl"), queue.queue.url);
  }
  const eventBinding = plan.providerBindings.find(({ capability }) => capability === "events");
  if (eventBinding !== undefined) {
    assign(environment, reference(eventBinding, "busName"), resources.events.eventBusName);
  }
  return environment;
}

export function withoutManagedCredentials(
  plan: DeploymentPlan,
  source: Record<string, pulumi.Input<string>>,
): Record<string, pulumi.Input<string>> {
  const blocked = new Set<string>();
  for (const binding of plan.providerBindings)
    collectCredentialReferences(binding.configuration, "", blocked);
  return Object.fromEntries(Object.entries(source).filter(([name]) => !blocked.has(name)));
}

function bindingFor(plan: DeploymentPlan, id: string): ProviderDeploymentPlan {
  const binding = plan.providerBindings.find((entry) => entry.id === id);
  if (binding === undefined) throw new Error(`Managed provider binding "${id}" is absent.`);
  return binding;
}

function reference(binding: ProviderDeploymentPlan, path: string): string | undefined {
  let value: unknown = binding.configuration;
  for (const part of path.split(".")) {
    if (!record(value)) return undefined;
    value = value[part];
  }
  return record(value) && value.kind === "env-ref" && typeof value.name === "string"
    ? value.name
    : undefined;
}

function assign(
  target: Record<string, pulumi.Input<string>>,
  name: string | undefined,
  value: pulumi.Input<string>,
): void {
  if (name !== undefined) target[name] = value;
}

function collectCredentialReferences(value: unknown, path: string, names: Set<string>): void {
  if (!record(value)) return;
  if (value.kind === "env-ref" && typeof value.name === "string") {
    if (/(?:credentials?|accessKeyId|secretAccessKey|sessionToken)/i.test(path))
      names.add(value.name);
    return;
  }
  for (const [name, item] of Object.entries(value)) {
    collectCredentialReferences(item, path === "" ? name : `${path}.${name}`, names);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
