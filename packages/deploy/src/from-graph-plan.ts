import { deepFreeze } from "@relkit/contracts";
import type { AppNode, ApplicationGraph, ProviderBindingNode } from "@relkit/graph";
import { DEPLOYMENT_PLAN_VERSION, type ContainerImagePlan, type DeploymentPlan } from "./plan.js";
import type { FromGraphOptions } from "./from-graph-validation.js";
import { byLogical, envNames, isManaged, logicalName, nodes } from "./from-graph-validation.js";
import { accessActions } from "./from-graph-providers.js";
import { base, type PlanContext } from "./from-graph-context.js";
import { createIamPlan } from "./iam.js";
import { jobs } from "./from-graph-jobs.js";
import { buckets, caches, eventTriggers, events, routes } from "./from-graph-resources.js";
import {
  accessOperations,
  connectedBindings,
  engine,
  host,
  infrastructureOperations,
} from "./from-graph-integrations.js";

export function buildPlan(
  graph: ApplicationGraph,
  app: AppNode,
  appId: string,
  graphHash: string,
  options: FromGraphOptions,
  providers: Map<string, ProviderBindingNode>,
): DeploymentPlan {
  const context: PlanContext = { appId, graphHash, graph, providers };
  const image = options.image ?? defaultImage(appId, options.httpPort ?? 3000);
  validateImage(image);
  const environmentNames = envNames(graph.nodes);
  return deepFreeze({
    contractVersion: DEPLOYMENT_PLAN_VERSION,
    graphHash,
    application: { id: appId, image, environmentNames },
    engine: engine(app),
    host: host(app),
    connectedBindings: connectedBindings(providers, graph.edges),
    infrastructureOperations: infrastructureOperations(providers, graph.edges),
    accessOperations: accessOperations(providers, graph.edges),
    http: {
      logicalName: logicalName(appId, "http", "public"),
      port: image.health.port,
      health: image.health,
      routes: routes(graph.nodes),
      configurationNames: environmentNames,
    },
    jobs: jobs(context),
    schedules: schedules(context),
    events: events(context),
    eventTriggers: eventTriggers(context),
    buckets: buckets(context),
    caches: caches(context),
    iam: createIamPlan(appId, graph, providers),
  } as DeploymentPlan);
}

function schedules(context: PlanContext) {
  return nodes(context.graph.nodes, "job")
    .filter((job) => isManaged(context.providers, "job", job.profile))
    .flatMap((job) => {
      const value = "schedules" in job ? (job.schedules ?? job.schedule) : job.schedule;
      if (!Array.isArray(value)) return [];
      return value.map((schedule, index) => ({
        ...base(
          context,
          descriptorId(schedule, `${job.id}:schedule:${index}`),
          "schedule",
          "job",
          job.profile,
        ),
        jobId: job.id,
        schedule,
      }));
    })
    .sort(byLogical);
}

function defaultImage(appId: string, port: number): ContainerImagePlan {
  return {
    name: appId,
    tag: "latest",
    health: {
      livenessPath: "/_relkit/v1/health/live",
      readinessPath: "/_relkit/v1/health/ready",
      port,
    },
  };
}

function descriptorId(value: unknown, fallback: string): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const id = (value as { readonly id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return fallback;
}

function validateImage(image: ContainerImagePlan): void {
  if (
    !image.name ||
    !image.health ||
    !image.health.livenessPath ||
    !image.health.readinessPath ||
    !Number.isInteger(image.health.port) ||
    image.health.port < 1
  )
    throw new TypeError("Deployment image health metadata is invalid.");
}
