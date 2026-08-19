import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  ZsysApplicationService,
  ZsysBuckets,
  ZsysCaches,
  ZsysContainerRegistry,
  ZsysEventBus,
  ZsysJobQueues,
  ZsysNetwork,
  ZsysObservability,
} from "@zsys/cloud-aws";
import type { DeploymentPlan } from "@zsys/deploy";
import {
  createServicePolicy,
  eventTriggerDefinition,
  imageValue,
  jobDefinition,
  scheduleDefinition,
} from "./aws-program-support.js";

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
  readonly jobs: ZsysJobQueues;
  readonly events: ZsysEventBus;
  readonly buckets: ZsysBuckets;
  readonly caches: ZsysCaches;
}

export interface AwsProgramResources {
  readonly root: pulumi.ComponentResource;
  readonly network: ZsysNetwork;
  readonly registry: ZsysContainerRegistry;
  readonly jobs: ZsysJobQueues;
  readonly events: ZsysEventBus;
  readonly buckets: ZsysBuckets;
  readonly caches: ZsysCaches;
  readonly observability: ZsysObservability;
  readonly service: ZsysApplicationService;
  readonly policy?: aws.iam.RolePolicy;
}

/** Maps the provider-neutral plan to the complete AWS component topology. */
export function createAwsPulumiResources(
  plan: DeploymentPlan,
  options: AwsProgramOptions = {},
): AwsProgramResources {
  const root = new pulumi.ComponentResource("zsys:cloud-aws:application", plan.application.id);
  const common = {
    appId: plan.application.id,
    stackName: options.stackName ?? pulumi.getStack(),
    graphHash: plan.graphHash,
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.tags === undefined ? {} : { tags: options.tags }),
  } as const;
  const child = { parent: root } as const;
  const network = new ZsysNetwork("network", { ...common, natGatewayStrategy: "Single" }, child);
  const registry = new ZsysContainerRegistry(
    "registry",
    {
      ...common,
      ...(options.forceDelete === undefined ? {} : { forceDelete: options.forceDelete }),
    },
    child,
  );
  const jobs = new ZsysJobQueues(
    "jobs",
    {
      ...common,
      jobs: plan.jobs.map(jobDefinition),
      schedules: plan.schedules.map(scheduleDefinition),
    },
    child,
  );
  const events = new ZsysEventBus(
    "events",
    {
      ...common,
      events: plan.events.map(({ id, version }) => ({ id, version })),
      eventTriggers: plan.eventTriggers.map(eventTriggerDefinition),
      eventSource: "zsys.application",
    },
    child,
  );
  const buckets = new ZsysBuckets(
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
  const caches = new ZsysCaches(
    "caches",
    {
      ...common,
      network,
      caches: plan.caches.map(({ id }) => ({ id })),
    },
    child,
  );
  const observability = new ZsysObservability(
    "observability",
    { ...common, logs: plan.observability.logs, traces: plan.observability.traces },
    child,
  );
  const environment = options.serviceEnvironment?.({ jobs, events, buckets, caches });
  const service = new ZsysApplicationService(
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
        ZSYS_APPLICATION_ID: plan.application.id,
        ...(environment === undefined ? {} : environment),
        ...Object.fromEntries(
          buckets.buckets.map(({ environment }) => [environment.name, environment.value]),
        ),
        ...Object.fromEntries(
          caches.caches.map(({ environment }) => [environment.name, environment.value]),
        ),
      },
    },
    { parent: root, dependsOn: [network, registry, jobs, events, buckets, caches, observability] },
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
    observability,
    service,
    ...(policy === undefined ? {} : { policy }),
  };
}
