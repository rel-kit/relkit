import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { RelkitComponentArgs } from "../common.js";

export type RelkitEventRetryJitter = "none" | "full" | "equal";

export interface RelkitEventRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: RelkitEventRetryJitter;
}

export interface RelkitEventDefinition {
  readonly id: string;
  readonly version: number;
}

export interface RelkitEventTriggerDefinition {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly retry?: RelkitEventRetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly visibilityTimeoutSeconds?: number;
  readonly messageRetentionSeconds?: number;
  readonly deadLetterRetentionSeconds?: number;
  readonly maxReceiveCount?: number;
  readonly workerBatchSize?: number;
  readonly workerWaitTimeSeconds?: number;
}

export interface RelkitEventBridgeRetryPolicy {
  readonly maximumRetryAttempts?: number;
  readonly maximumEventAgeInSeconds?: number;
}

export interface RelkitEventBusArgs extends RelkitComponentArgs {
  readonly events: readonly RelkitEventDefinition[];
  readonly eventTriggers?: readonly RelkitEventTriggerDefinition[];
  /** Alias accepted for callers that already use the generic trigger term. */
  readonly triggers?: readonly RelkitEventTriggerDefinition[];
  readonly eventBusName?: pulumi.Input<string>;
  readonly eventSource?: string;
  readonly consumerRoleArn?: pulumi.Input<string>;
  readonly workerRoleArn?: pulumi.Input<string>;
  readonly eventBridgeRetryPolicy?: RelkitEventBridgeRetryPolicy;
}

export interface RelkitEventWorkerConfiguration {
  readonly eventTriggerId: string;
  readonly targetFunctionId: string;
  readonly queueArn: pulumi.Output<string>;
  readonly queueUrl: pulumi.Output<string>;
  readonly deadLetterQueueArn: pulumi.Output<string>;
  readonly eventId: string;
  readonly eventVersion: number;
  readonly batchSize: number;
  readonly concurrency?: number;
  readonly waitTimeSeconds: number;
  readonly visibilityTimeoutSeconds: number;
  readonly deliverySemantics: "at-least-once";
  readonly envelopePath: "$.envelope";
  readonly tracePath: "$.envelope.propagation.producer.traceId";
  readonly correlationPath: "$.envelope.propagation.correlationId";
  readonly causationPath: "$.envelope.propagation.invocationId";
  readonly environment: pulumi.Output<Record<string, string>>;
}

export interface RelkitEventTriggerResource {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly queue: aws.sqs.Queue;
  readonly deadLetterQueue: aws.sqs.Queue;
  readonly queuePolicy: aws.sqs.QueuePolicy;
  readonly deadLetterQueuePolicy: aws.sqs.QueuePolicy;
  readonly redriveAllowPolicy: aws.sqs.RedriveAllowPolicy;
  readonly rules: readonly aws.cloudwatch.EventRule[];
  readonly targets: readonly aws.cloudwatch.EventTarget[];
  readonly maxReceiveCount: number;
  readonly worker: RelkitEventWorkerConfiguration;
}
