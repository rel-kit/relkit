import type { JsonValue } from "@relkit/contracts";
import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { RelkitComponentArgs } from "../common.js";

export type RelkitRetryJitter = "none" | "full" | "equal";

export interface RelkitJobRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: RelkitRetryJitter;
}

export interface RelkitJobQueueDefinition {
  readonly id: string;
  readonly retry: RelkitJobRetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly visibilityTimeoutSeconds?: number;
  readonly messageRetentionSeconds?: number;
  readonly deadLetterRetentionSeconds?: number;
  readonly maxReceiveCount?: number;
  readonly workerBatchSize?: number;
  readonly workerWaitTimeSeconds?: number;
}

export interface RelkitScheduleDefinition {
  readonly id: string;
  readonly jobId: string;
  readonly cron: string;
  readonly timezone: string;
  readonly input: JsonValue;
  readonly overlap: "skip" | "allow";
}

export interface RelkitSchedulerRetryPolicy {
  readonly maximumRetryAttempts?: number;
  readonly maximumEventAgeInSeconds?: number;
}

export interface RelkitJobQueuesArgs extends RelkitComponentArgs {
  readonly jobs: readonly RelkitJobQueueDefinition[];
  readonly schedules?: readonly RelkitScheduleDefinition[];
  readonly workerRoleArn?: pulumi.Input<string>;
  readonly schedulerRoleArn?: pulumi.Input<string>;
  readonly workerBatchSize?: number;
  readonly workerWaitTimeSeconds?: number;
  readonly schedulerRetryPolicy?: RelkitSchedulerRetryPolicy;
}

export interface RelkitWorkerConsumptionConfiguration {
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

export interface RelkitJobQueueResource {
  readonly id: string;
  readonly queue: aws.sqs.Queue;
  readonly deadLetterQueue: aws.sqs.Queue;
  readonly queuePolicy: aws.sqs.QueuePolicy;
  readonly deadLetterQueuePolicy?: aws.sqs.QueuePolicy;
  readonly redriveAllowPolicy: aws.sqs.RedriveAllowPolicy;
  readonly maxReceiveCount: number;
  readonly retry: RelkitJobRetryPolicy;
  readonly worker: RelkitWorkerConsumptionConfiguration;
}

export interface RelkitScheduleResource {
  readonly id: string;
  readonly jobId: string;
  readonly expression: string;
  readonly inputJson: string;
  readonly overlap: "skip" | "allow";
  readonly schedule: aws.scheduler.Schedule;
}
