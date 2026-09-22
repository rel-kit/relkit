import type { JobNode, TaskJobNode } from "@relkit/graph";
import type { JobWorkerDeploymentPlan } from "./plan.js";
import { byLogical, isManaged, nodes } from "./from-graph-validation.js";
import { accessActions } from "./from-graph-providers.js";
import { base, type PlanContext } from "./from-graph-context.js";

export function jobs(context: PlanContext) {
  return nodes(context.graph.nodes, "job")
    .filter((job): job is JobNode => isManaged(context.providers, "job", job.profile))
    .map((job) =>
      "executionModel" in job && job.executionModel === "task"
        ? taskJob(context, job)
        : legacyJob(context, job),
    )
    .sort(byLogical);
}

function legacyJob(context: PlanContext, job: JobNode) {
  if (!("targetFunctionId" in job)) throw new TypeError(`Legacy job "${job.id}" has no target.`);
  return {
    ...base(
      context,
      job.id,
      "job",
      "job",
      job.profile,
      accessActions(context.providers.get(`provider.job.${job.profile}`)!),
    ),
    targetFunctionId: job.targetFunctionId,
    profile: job.profile,
    ...(defined(job.retry) ? { retry: job.retry } : {}),
    ...(defined(job.timeoutMs) ? { timeoutMs: job.timeoutMs } : {}),
    ...(defined(job.concurrency) ? { concurrency: job.concurrency } : {}),
    ...(defined(job.idempotency) ? { idempotency: job.idempotency } : {}),
  };
}

function taskJob(context: PlanContext, job: TaskJobNode) {
  const buildId = text(job.buildId, `${job.id}:buildId`);
  const serviceGeneration = text(job.serviceGeneration, `${job.id}:serviceGeneration`);
  return {
    ...base(
      context,
      job.id,
      "job",
      "job",
      job.profile,
      accessActions(context.providers.get(`provider.job.${job.profile}`)!),
    ),
    executionModel: "task" as const,
    jobId: job.jobId,
    name: job.name,
    taskId: job.taskId,
    taskVersion: job.taskVersion,
    buildId,
    serviceGeneration,
    profile: job.profile,
    ...(defined(job.policy) ? { policy: job.policy } : {}),
    ...(defined(job.schedules ?? job.schedule) ? { schedules: job.schedules ?? job.schedule } : {}),
    worker: workerPlan(job, buildId, serviceGeneration),
  };
}

function workerPlan(
  job: TaskJobNode,
  buildId: string,
  serviceGeneration: string,
): JobWorkerDeploymentPlan {
  return {
    provider: job.profile,
    publication: "native",
    taskId: job.taskId,
    taskVersion: job.taskVersion,
    buildId,
    serviceGeneration,
    runtime: "bun",
    ...(job.policy === undefined ? {} : { policy: job.policy }),
    stages: ["provision", "secrets", "publish", "register", "readiness", "schedules", "activate"],
  };
}

function defined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function text(value: unknown, path: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new TypeError(`Task deployment metadata ${path} is required.`);
}
