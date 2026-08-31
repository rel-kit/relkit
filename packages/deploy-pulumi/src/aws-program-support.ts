import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  type RelkitApplicationService,
  type RelkitBuckets,
  type RelkitCaches,
  type RelkitEventBus,
  type RelkitJobQueues,
  type RelkitEventTriggerDefinition,
  type RelkitJobQueueDefinition,
  type RelkitScheduleDefinition,
} from "@relkit/cloud-aws";
import type { DeploymentPlan } from "@relkit/deploy";

export function jobDefinition(job: DeploymentPlan["jobs"][number]): RelkitJobQueueDefinition {
  return {
    id: job.id,
    retry: retryPolicy(job.retry),
    ...(job.timeoutMs === undefined ? {} : { timeoutMs: job.timeoutMs }),
    ...(job.concurrency === undefined ? {} : { concurrency: job.concurrency }),
  };
}

export function eventTriggerDefinition(
  trigger: DeploymentPlan["eventTriggers"][number],
): RelkitEventTriggerDefinition {
  return {
    id: trigger.id,
    targetFunctionId: trigger.targetFunctionId,
    eventId: trigger.eventId,
    eventVersion: trigger.eventVersion,
    ...(trigger.retry === undefined ? {} : { retry: retryPolicy(trigger.retry) }),
    ...(trigger.concurrency === undefined ? {} : { concurrency: trigger.concurrency }),
    ...(trigger.timeoutMs === undefined ? {} : { timeoutMs: trigger.timeoutMs }),
  };
}

export function scheduleDefinition(
  schedule: DeploymentPlan["schedules"][number],
): RelkitScheduleDefinition {
  const value = record(schedule.schedule);
  const cron = text(value.cron ?? value.expression);
  if (cron === undefined) throw new TypeError(`Schedule "${schedule.id}" has no cron expression.`);
  return {
    id: schedule.id,
    jobId: schedule.jobId,
    cron,
    timezone: text(value.timezone) ?? "UTC",
    input: value.input ?? {},
    overlap: value.overlap === "allow" ? "allow" : "skip",
  };
}

export function createServicePolicy(
  plan: DeploymentPlan,
  service: RelkitApplicationService,
  buckets: RelkitBuckets,
  jobs: RelkitJobQueues,
  events: RelkitEventBus,
  caches: RelkitCaches,
  root: pulumi.ComponentResource,
): aws.iam.RolePolicy | undefined {
  if (plan.iam.serviceRole.statements.length === 0) return undefined;
  const arns = new Map<string, pulumi.Input<string>>();
  addArns(arns, plan.buckets, buckets.buckets);
  addArns(
    arns,
    plan.jobs,
    jobs.queues.map(({ id, queue }) => ({ id, arn: queue.arn })),
  );
  addArns(arns, plan.caches, caches.caches);
  plan.events.forEach((entry) => arns.set(entry.logicalName, events.eventBusArn));
  addArns(
    arns,
    plan.eventTriggers.filter(({ delivery }) => delivery === "durable"),
    events.triggers.map(({ id, queue }) => ({ id, arn: queue.arn })),
  );
  const values: pulumi.Input<string>[] = [];
  const indexes = new Map<string, number>();
  const statements = plan.iam.serviceRole.statements.map((statement) => ({
    Effect: "Allow",
    Action: statement.actions,
    Resource: statement.resources.map((name) => {
      const arn = arns.get(name);
      if (arn === undefined)
        throw new Error(`AWS IAM resource "${name}" is not in the deployment plan.`);
      const index = indexes.get(name) ?? values.push(arn) - 1;
      indexes.set(name, index);
      return index;
    }),
  }));
  const policy = pulumi.all(values).apply((resolved) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: statements.map((statement) => ({
        ...statement,
        Resource: statement.Resource.map((value) => resolved[value]!),
      })),
    }),
  );
  return new aws.iam.RolePolicy(
    "service-access",
    { role: service.taskRole.name, policy },
    { parent: root, dependsOn: [service, buckets, jobs, events, caches] },
  );
}

export function imageValue(plan: DeploymentPlan): string {
  const image = plan.application.image;
  if (image.digest !== undefined) return `${image.name}@${image.digest}`;
  if (image.tag !== undefined) return `${image.name}:${image.tag}`;
  const lastSegment = image.name.slice(image.name.lastIndexOf("/") + 1);
  return lastSegment.includes(":") || image.name.includes("@")
    ? image.name
    : `${image.name}:latest`;
}

function addArns(
  target: Map<string, pulumi.Input<string>>,
  entries: readonly { readonly id: string; readonly logicalName: string }[],
  resources: readonly { readonly id: string; readonly arn: pulumi.Input<string> }[],
): void {
  const byId = new Map(resources.map((resource) => [resource.id, resource.arn]));
  entries.forEach((entry) => {
    const arn = byId.get(entry.id);
    if (arn === undefined) throw new Error(`AWS resource "${entry.id}" is not materialized.`);
    target.set(entry.logicalName, arn);
  });
}

function retryPolicy(value: unknown) {
  const retry = record(value);
  return {
    maxAttempts: integer(retry.maxAttempts, 2),
    initialDelayMs: integer(retry.initialDelayMs, 100),
    maxDelayMs: integer(retry.maxDelayMs, 1_000),
    multiplier: number(retry.multiplier, 2),
    jitter: "none" as const,
  };
}

function record(value: unknown): Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
