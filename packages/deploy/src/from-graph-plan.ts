import { deepFreeze } from "@zsys/contracts";
import type { ApplicationGraph, ProviderProfileNode } from "@zsys/graph";
import { DEPLOYMENT_PLAN_VERSION, type ContainerImagePlan, type DeploymentPlan } from "./plan.js";
import type { FromGraphOptions } from "./from-graph-validation.js";
import { byLogical, envNames, logicalName, nodes } from "./from-graph-validation.js";
import { iam } from "./from-graph-aws.js";
import { base, type PlanContext } from "./from-graph-context.js";
import { createIamPlan } from "./iam.js";
import {
  buckets,
  caches,
  eventTriggers,
  events,
  modelPlans,
  routes,
} from "./from-graph-resources.js";

export function buildPlan(
  graph: ApplicationGraph,
  appId: string,
  graphHash: string,
  options: FromGraphOptions,
  providers: Map<string, ProviderProfileNode>,
): DeploymentPlan {
  const context: PlanContext = { appId, graphHash, graph, providers };
  const image = options.image ?? defaultImage(appId, options.httpPort ?? 3000);
  validateImage(image);
  const environmentNames = envNames(graph.nodes);
  const models = modelPlans(context, options);
  return deepFreeze({
    contractVersion: DEPLOYMENT_PLAN_VERSION,
    graphHash,
    application: { id: appId, image, environmentNames },
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
    ...(models.length === 0 ? {} : { models }),
    iam: createIamPlan(appId, graph),
    observability: {
      logicalName: logicalName(appId, "observability", "default"),
      configurationNames: environmentNames.filter((name) => /log|trace|otlp/i.test(name)),
      logs: true,
      traces: true,
    },
  } as DeploymentPlan);
}

function jobs(context: PlanContext) {
  return nodes(context.graph.nodes, "job")
    .map((job) => ({
      ...base(
        context,
        job.id,
        "job",
        "jobs",
        job.profile,
        iam("jobs", job.id, context.graph.edges),
      ),
      targetFunctionId: job.targetFunctionId,
      profile: job.profile,
      ...(defined(job.retry) ? { retry: job.retry } : {}),
      ...(defined(job.timeoutMs) ? { timeoutMs: job.timeoutMs } : {}),
      ...(defined(job.concurrency) ? { concurrency: job.concurrency } : {}),
      ...(defined(job.idempotency) ? { idempotency: job.idempotency } : {}),
    }))
    .sort(byLogical);
}

function schedules(context: PlanContext) {
  return nodes(context.graph.nodes, "job")
    .flatMap((job) => {
      if (!Array.isArray(job.schedule)) return [];
      return job.schedule.map((schedule, index) => ({
        ...base(
          context,
          descriptorId(schedule, `${job.id}:schedule:${index}`),
          "schedule",
          "jobs",
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
      livenessPath: "/_zsys/v1/health/live",
      readinessPath: "/_zsys/v1/health/ready",
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

function defined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
