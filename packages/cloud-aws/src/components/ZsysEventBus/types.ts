import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { ZsysComponentArgs } from "../common.js";

export type ZsysEventRetryJitter = "none" | "full" | "equal";

export interface ZsysEventRetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
  readonly jitter: ZsysEventRetryJitter;
}

export interface ZsysEventDefinition {
  readonly id: string;
  readonly version: number;
}

export interface ZsysEventTriggerDefinition {
  readonly id: string;
  readonly targetFunctionId: string;
  readonly expansion: readonly string[];
  readonly retry?: ZsysEventRetryPolicy;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly visibilityTimeoutSeconds?: number;
  readonly messageRetentionSeconds?: number;
  readonly deadLetterRetentionSeconds?: number;
  readonly maxReceiveCount?: number;
  readonly workerBatchSize?: number;
  readonly workerWaitTimeSeconds?: number;
}

export interface ZsysEventBridgeRetryPolicy {
  readonly maximumRetryAttempts?: number;
  readonly maximumEventAgeInSeconds?: number;
}

export interface ZsysEventBusArgs extends ZsysComponentArgs {
  readonly events: readonly ZsysEventDefinition[];
  readonly eventTriggers?: readonly ZsysEventTriggerDefinition[];
  /** Alias accepted for callers that already use the generic trigger term. */
  readonly triggers?: readonly ZsysEventTriggerDefinition[];
  readonly eventBusName?: pulumi.Input<string>;
  readonly eventSource?: string;
  readonly consumerRoleArn?: pulumi.Input<string>;
  readonly workerRoleArn?: pulumi.Input<string>;
  readonly eventBridgeRetryPolicy?: ZsysEventBridgeRetryPolicy;
}

export interface ZsysEventWorkerConfiguration {
  readonly eventTriggerId: string;
  readonly targetFunctionId: string;
  readonly queueArn: pulumi.Output<string>;
  readonly queueUrl: pulumi.Output<string>;
  readonly deadLetterQueueArn: pulumi.Output<string>;
  readonly expansion: readonly string[];
  readonly batchSize: number;
  readonly concurrency: number;
  readonly waitTimeSeconds: number;
  readonly visibilityTimeoutSeconds: number;
  readonly deliverySemantics: "at-least-once";
  readonly envelopePath: "$.envelope";
  readonly tracePath: "$.envelope.traceId";
  readonly correlationPath: "$.envelope.correlationId";
  readonly causationPath: "$.envelope.causationInvocationId";
  readonly environment: pulumi.Output<Record<string, string>>;
}

export interface ZsysEventTriggerResource {
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
  readonly worker: ZsysEventWorkerConfiguration;
}
