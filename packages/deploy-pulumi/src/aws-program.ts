import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  RelkitApplicationService,
  RelkitBuckets,
  RelkitCaches,
  RelkitContainerRegistry,
  RelkitEventBus,
  RelkitJobQueues,
  RelkitNetwork,
  RelkitObservability,
} from "@relkit/cloud-aws";
import type { DeploymentPlan } from "@relkit/deploy";
import {
  createServicePolicy,
  eventTriggerDefinition,
  imageValue,
  jobDefinition,
  scheduleDefinition,
} from "./aws-program-support.js";
import { managedEnvironment, withoutManagedCredentials } from "./aws-program-environment.js";

export interface AwsProgramOptions {
  readonly stackName?: string;
  readonly region?: pulumi.Input<string>;
  readonly tags?: pulumi.Input<Record<string, pulumi.Input<string>>>;
  readonly forceDelete?: pulumi.Input<boolean>;
  readonly forceDestroy?: pulumi.Input<boolean>;
  readonly serviceEnvironment?: (
    resources: AwsProgramEnvironmentResources,
  ) => Record<string, pulumi.Input<string>>;
}

export interface AwsProgramEnvironmentResources {
  readonly jobs: RelkitJobQueues;
  readonly events: RelkitEventBus;
  readonly buckets: RelkitBuckets;
  readonly caches: RelkitCaches;
}

export interface AwsProgramResources {
  readonly root: pulumi.ComponentResource;
  readonly network: RelkitNetwork;
  readonly registry: RelkitContainerRegistry;
  readonly jobs: RelkitJobQueues;
  readonly events: RelkitEventBus;
  readonly buckets: RelkitBuckets;
  readonly caches: RelkitCaches;
  readonly observability?: RelkitObservability;
  readonly service: RelkitApplicationService;
  readonly policy?: aws.iam.RolePolicy;
}

/** Maps the provider-neutral plan to the complete AWS component topology. */
export function createAwsPulumiResources(
  plan: DeploymentPlan,
  options: AwsProgramOptions = {},
): AwsProgramResources {
  const durableEventTriggers = plan.eventTriggers.filter(({ delivery }) => delivery === "durable");
  const root = new pulumi.ComponentResource("relkit:cloud-aws:application", plan.application.id);
  const common = {
    appId: plan.application.id,
    stackName: options.stackName ?? pulumi.getStack(),
    graphHash: plan.graphHash,
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.tags === undefined ? {} : { tags: options.tags }),
  } as const;
  const child = { parent: root } as const;
  const network = new RelkitNetwork("network", { ...common, natGatewayStrategy: "Single" }, child);
  const registry = new RelkitContainerRegistry(
    "registry",
    {
      ...common,
      ...(options.forceDelete === undefined ? {} : { forceDelete: options.forceDelete }),
    },
    child,
  );
  const jobs = new RelkitJobQueues(
    "jobs",
    {
      ...common,
      jobs: plan.jobs.map(jobDefinition),
      schedules: plan.schedules.map(scheduleDefinition),
    },
    child,
  );
  const events = new RelkitEventBus(
    "events",
    {
      ...common,
      events: plan.events.map(({ id, version }) => ({ id, version })),
      eventTriggers: durableEventTriggers.map(eventTriggerDefinition),
      eventSource: "relkit.application",
    },
    child,
  );
  const buckets = new RelkitBuckets(
    "buckets",
    {
      ...common,
      buckets: plan.buckets.map(({ id, visibility }) => ({
        id,
        visibility,
        ...(options.forceDestroy === undefined ? {} : { forceDestroy: options.forceDestroy }),
      })),
    },
    child,
  );
  const caches = new RelkitCaches(
    "caches",
    {
      ...common,
      network,
      caches: plan.caches.map(({ id }) => ({ id })),
    },
    child,
  );
  const observability =
    plan.observability === undefined
      ? undefined
      : new RelkitObservability(
          "observability",
          { ...common, logs: plan.observability.logs, traces: plan.observability.traces },
          child,
        );
  const environment = options.serviceEnvironment?.({ jobs, events, buckets, caches });
  const region = options.region ?? aws.config.region ?? "us-east-1";
  const generatedEnvironment = managedEnvironment(plan, { jobs, events, buckets, caches }, region);
  const service = new RelkitApplicationService(
    "service",
    {
      ...common,
      network,
      registry,
      image: imageValue(plan),
      containerPort: plan.application.image.health.port,
      livenessPath: plan.application.image.health.livenessPath,
      readinessPath: plan.application.image.health.readinessPath,
      environment: {
        RELKIT_APPLICATION_ID: plan.application.id,
        ...(environment === undefined ? {} : withoutManagedCredentials(plan, environment)),
        ...generatedEnvironment,
      },
    },
    {
      parent: root,
      dependsOn: [
        network,
        registry,
        jobs,
        events,
        buckets,
        caches,
        ...(observability === undefined ? [] : [observability]),
      ],
    },
  );
  const policy = createServicePolicy(plan, service, buckets, jobs, events, caches, root);
  return {
    root,
    network,
    registry,
    jobs,
    events,
    buckets,
    caches,
    ...(observability === undefined ? {} : { observability }),
    service,
    ...(policy === undefined ? {} : { policy }),
  };
}
