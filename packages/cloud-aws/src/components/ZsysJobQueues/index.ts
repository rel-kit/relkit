import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { resourceName, tagsFor } from "../common.js";
import {
  childName,
  createQueueResources,
  createSchedulerRole,
  createWorkerRole,
} from "./resources.js";
import { createSchedulerPolicy, createWorkerPolicy } from "./policies.js";
import {
  normalizeJobs,
  normalizeSchedules,
  normalizeSchedulerRetry,
  toAwsScheduleExpression,
  type NormalizedJobQueue,
} from "./validation.js";
import type {
  ZsysJobQueueResource,
  ZsysJobQueuesArgs,
  ZsysScheduleResource,
  ZsysWorkerConsumptionConfiguration,
} from "./types.js";

export * from "./types.js";
export { toAwsScheduleExpression } from "./validation.js";

/** SQS job queues, redrive policies, worker settings, and EventBridge schedules. */
export class ZsysJobQueues extends pulumi.ComponentResource {
  readonly queues: readonly ZsysJobQueueResource[];
  readonly queueResources: readonly ZsysJobQueueResource[];
  readonly schedules: readonly ZsysScheduleResource[];
  readonly workerConfigurations: readonly ZsysWorkerConsumptionConfiguration[];
  readonly workerRole: aws.iam.Role | undefined;
  readonly workerRoleArn: pulumi.Output<string>;
  readonly workerPolicy: aws.iam.RolePolicy | undefined;
  readonly schedulerRole: aws.iam.Role | undefined;
  readonly schedulerRoleArn: pulumi.Output<string> | undefined;
  readonly schedulerPolicy: aws.iam.RolePolicy | undefined;
  readonly tags: pulumi.Output<Record<string, string>>;

  constructor(name: string, args: ZsysJobQueuesArgs, opts: pulumi.ComponentResourceOptions = {}) {
    const jobs = normalizeJobs(args);
    const schedules = normalizeSchedules(args.schedules, jobs);
    const schedulerRetry = normalizeSchedulerRetry(args.schedulerRetryPolicy);
    const componentName = resourceName(name, "job-queues", args, 64);
    super("zsys:cloud-aws:ZsysJobQueues", componentName, {}, opts);
    this.tags = tagsFor(name, args);

    if (args.workerRoleArn === undefined) {
      const role = createWorkerRole(componentName, this.tags, this);
      this.workerRole = role;
      this.workerRoleArn = role.arn;
    } else {
      this.workerRole = undefined;
      this.workerRoleArn = pulumi.output(args.workerRoleArn);
    }
    if (schedules.length > 0) {
      if (args.schedulerRoleArn === undefined) {
        const role = createSchedulerRole(componentName, this.tags, this);
        this.schedulerRole = role;
        this.schedulerRoleArn = role.arn;
      } else {
        this.schedulerRole = undefined;
        this.schedulerRoleArn = pulumi.output(args.schedulerRoleArn);
      }
    } else {
      this.schedulerRole = undefined;
      this.schedulerRoleArn = undefined;
    }

    const baseQueues = jobs.map((job) =>
      createQueueResources(
        componentName,
        job,
        this.tags,
        this.workerRoleArn,
        this.schedulerRoleArn,
        this,
      ),
    );
    this.queues = baseQueues.map((queue, index) => ({
      ...queue,
      retry: jobs[index]!.retry,
      worker: workerConfiguration(jobs[index]!, queue),
    }));
    this.queueResources = this.queues;
    this.workerConfigurations = this.queues.map(({ worker }) => worker);
    this.workerPolicy = this.workerRole
      ? createWorkerPolicy(
          componentName,
          this.workerRole,
          this.queues.map(({ queue }) => queue.arn),
          this,
        )
      : undefined;
    this.schedulerPolicy = this.schedulerRole
      ? createSchedulerPolicy(
          componentName,
          this.schedulerRole,
          this.queues.map(({ queue }) => queue.arn),
          this.queues.map(({ deadLetterQueue }) => deadLetterQueue.arn),
          this,
        )
      : undefined;
    this.schedules = schedules.map((schedule) => {
      const queue = this.queues.find(({ id }) => id === schedule.jobId);
      if (queue === undefined || this.schedulerRoleArn === undefined)
        throw new Error("AWS schedule mapping failed.");
      const expression = toAwsScheduleExpression(schedule.cron);
      const dependencies: pulumi.Resource[] = [queue.queuePolicy, queue.redriveAllowPolicy];
      if (queue.deadLetterQueuePolicy !== undefined) dependencies.push(queue.deadLetterQueuePolicy);
      if (this.schedulerPolicy !== undefined) dependencies.push(this.schedulerPolicy);
      const resource = new aws.scheduler.Schedule(
        childName(componentName, schedule.id, "schedule"),
        {
          name: childName(componentName, schedule.id, "schedule", 64),
          description: `ZSys schedule for ${schedule.jobId}`,
          flexibleTimeWindow: { mode: "OFF" },
          scheduleExpression: expression,
          scheduleExpressionTimezone: schedule.timezone,
          target: {
            arn: queue.queue.arn,
            roleArn: this.schedulerRoleArn,
            input: schedule.inputJson,
            deadLetterConfig: { arn: queue.deadLetterQueue.arn },
            retryPolicy: schedulerRetry,
          },
        },
        { parent: this, dependsOn: dependencies },
      );
      return {
        id: schedule.id,
        jobId: schedule.jobId,
        expression,
        inputJson: schedule.inputJson,
        overlap: schedule.overlap,
        schedule: resource,
      };
    });
    this.registerOutputs({
      queueArns: this.queues.map(({ queue }) => queue.arn),
      deadLetterQueueArns: this.queues.map(({ deadLetterQueue }) => deadLetterQueue.arn),
      scheduleArns: this.schedules.map(({ schedule }) => schedule.arn),
    });
  }
}

function workerConfiguration(
  job: NormalizedJobQueue,
  queue: Omit<ZsysJobQueueResource, "worker" | "retry">,
): ZsysWorkerConsumptionConfiguration {
  const environment = pulumi
    .all({
      id: job.id,
      queueArn: queue.queue.arn,
      queueUrl: queue.queue.url,
      deadLetterQueueArn: queue.deadLetterQueue.arn,
    })
    .apply(({ id, queueArn, queueUrl, deadLetterQueueArn }): Record<string, string> => ({
      ZSYS_JOB_ID: String(id),
      ZSYS_JOB_QUEUE_ARN: String(queueArn),
      ZSYS_JOB_QUEUE_URL: String(queueUrl),
      ZSYS_JOB_DLQ_ARN: String(deadLetterQueueArn),
      ZSYS_JOB_BATCH_SIZE: String(job.workerBatchSize),
      ZSYS_JOB_CONCURRENCY: String(job.concurrency),
      ZSYS_JOB_WAIT_TIME_SECONDS: String(job.workerWaitTimeSeconds),
      ZSYS_JOB_VISIBILITY_TIMEOUT_SECONDS: String(job.visibilityTimeoutSeconds),
      ZSYS_JOB_DELIVERY_SEMANTICS: "at-least-once",
    }));
  return {
    jobId: job.id,
    queueArn: queue.queue.arn,
    queueUrl: queue.queue.url,
    deadLetterQueueArn: queue.deadLetterQueue.arn,
    batchSize: job.workerBatchSize,
    concurrency: job.concurrency,
    waitTimeSeconds: job.workerWaitTimeSeconds,
    visibilityTimeoutSeconds: job.visibilityTimeoutSeconds,
    deliverySemantics: "at-least-once",
    environment,
  };
}
