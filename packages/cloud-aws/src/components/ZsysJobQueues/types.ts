import type { JsonValue } from "@zsys/contracts";
import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { ZsysComponentArgs } from "../common.js";

export type ZsysRetryJitter = "none" | "full" | "equal";

export interface ZsysJobRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: ZsysRetryJitter;
}

export interface ZsysJobQueueDefinition {
  readonly id: string;
  readonly retry: ZsysJobRetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly visibilityTimeoutSeconds?: number;
  readonly messageRetentionSeconds?: number;
  readonly deadLetterRetentionSeconds?: number;
  readonly maxReceiveCount?: number;
  readonly workerBatchSize?: number;
  readonly workerWaitTimeSeconds?: number;
}

export interface ZsysScheduleDefinition {
  readonly id: string;
  readonly jobId: string;
  readonly cron: string;
  readonly timezone: string;
  readonly input: JsonValue;
  readonly overlap: "skip" | "allow";
}

export interface ZsysSchedulerRetryPolicy {
  readonly maximumRetryAttempts?: number;
  readonly maximumEventAgeInSeconds?: number;
}

export interface ZsysJobQueuesArgs extends ZsysComponentArgs {
  readonly jobs: readonly ZsysJobQueueDefinition[];
  readonly schedules?: readonly ZsysScheduleDefinition[];
  readonly workerRoleArn?: pulumi.Input<string>;
  readonly schedulerRoleArn?: pulumi.Input<string>;
  readonly workerBatchSize?: number;
  readonly workerWaitTimeSeconds?: number;
  readonly schedulerRetryPolicy?: ZsysSchedulerRetryPolicy;
}

export interface ZsysWorkerConsumptionConfiguration {
  readonly jobId: string;
  readonly queueArn: pulumi.Output<string>;
  readonly queueUrl: pulumi.Output<string>;
  readonly deadLetterQueueArn: pulumi.Output<string>;
  readonly batchSize: number;
  readonly concurrency: number;
  readonly waitTimeSeconds: number;
  readonly visibilityTimeoutSeconds: number;
  readonly deliverySemantics: "at-least-once";
  readonly environment: pulumi.Output<Record<string, string>>;
}

export interface ZsysJobQueueResource {
  readonly id: string;
  readonly queue: aws.sqs.Queue;
  readonly deadLetterQueue: aws.sqs.Queue;
  readonly queuePolicy: aws.sqs.QueuePolicy;
  readonly deadLetterQueuePolicy?: aws.sqs.QueuePolicy;
  readonly redriveAllowPolicy: aws.sqs.RedriveAllowPolicy;
  readonly maxReceiveCount: number;
  readonly retry: ZsysJobRetryPolicy;
  readonly worker: ZsysWorkerConsumptionConfiguration;
}

export interface ZsysScheduleResource {
  readonly id: string;
  readonly jobId: string;
  readonly expression: string;
  readonly inputJson: string;
  readonly overlap: "skip" | "allow";
  readonly schedule: aws.scheduler.Schedule;
}
