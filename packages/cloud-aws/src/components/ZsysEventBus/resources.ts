import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { childResourceName } from "./names.js";
import { eventTargetPolicyJson, redriveAllowPolicyJson } from "./policies.js";
import {
  eventPattern,
  type NormalizedEventBridgeRetryPolicy,
  type NormalizedEventTrigger,
} from "./validation.js";
import type { ZsysEventTriggerResource, ZsysEventWorkerConfiguration } from "./types.js";

export function createTriggerResources(
  componentName: string,
  busName: pulumi.Input<string>,
  source: string,
  retryPolicy: NormalizedEventBridgeRetryPolicy,
  trigger: NormalizedEventTrigger,
  tags: pulumi.Input<Record<string, pulumi.Input<string>>>,
  consumerRoleArn: pulumi.Input<string>,
  parent: pulumi.Resource,
): ZsysEventTriggerResource {
  const queueName = childResourceName(componentName, trigger.id, "queue", 76);
  const deadLetterQueue = new aws.sqs.Queue(
    `${queueName}-dlq`,
    {
      name: `${queueName}-dlq`.slice(0, 80),
      messageRetentionSeconds: trigger.deadLetterRetentionSeconds,
      sqsManagedSseEnabled: true,
      tags,
    },
    { parent },
  );
  const queue = new aws.sqs.Queue(
    queueName,
    {
      name: queueName,
      messageRetentionSeconds: trigger.messageRetentionSeconds,
      receiveWaitTimeSeconds: trigger.workerWaitTimeSeconds,
      visibilityTimeoutSeconds: trigger.visibilityTimeoutSeconds,
      redrivePolicy: pulumi.jsonStringify({
        deadLetterTargetArn: deadLetterQueue.arn,
        maxReceiveCount: trigger.maxReceiveCount,
      }),
      sqsManagedSseEnabled: true,
      tags,
    },
    { parent },
  );
  const redriveAllowPolicy = new aws.sqs.RedriveAllowPolicy(
    `${queueName}-redrive-allow`,
    {
      queueUrl: deadLetterQueue.url,
      redriveAllowPolicy: redriveAllowPolicyJson(queue.arn),
    },
    { parent, dependsOn: [queue] },
  );
  const rules = trigger.expansion.map(
    (event) =>
      new aws.cloudwatch.EventRule(
        childResourceName(componentName, `${trigger.id}-${event.pair}`, "rule", 64),
        {
          name: childResourceName(componentName, `${trigger.id}-${event.pair}`, "rule", 64),
          description: `ZSys event trigger ${trigger.id} routes ${event.pair}`,
          eventBusName: busName,
          eventPattern: eventPattern(source, event),
          state: "ENABLED",
          tags,
        },
        { parent },
      ),
  );
  const targets = rules.map(
    (rule, index) =>
      new aws.cloudwatch.EventTarget(
        childResourceName(componentName, `${trigger.id}-${index}`, "target", 64),
        {
          arn: queue.arn,
          eventBusName: busName,
          rule: rule.name,
          targetId: childResourceName(trigger.id, `${index}`, "target", 64),
          inputTransformer: {
            inputPaths: { envelope: "$.detail" },
            inputTemplate: '{"schemaVersion":1,"envelope":<envelope>}',
          },
          deadLetterConfig: { arn: deadLetterQueue.arn },
          retryPolicy,
        },
        { parent, dependsOn: [rule, queue, deadLetterQueue] },
      ),
  );
  const ruleArns = rules.map(({ arn }) => arn);
  const queuePolicy = new aws.sqs.QueuePolicy(
    `${queueName}-event-policy`,
    {
      queueUrl: queue.url,
      policy: eventTargetPolicyJson(queue.arn, ruleArns),
    },
    { parent, dependsOn: targets },
  );
  const deadLetterQueuePolicy = new aws.sqs.QueuePolicy(
    `${queueName}-dlq-event-policy`,
    {
      queueUrl: deadLetterQueue.url,
      policy: eventTargetPolicyJson(deadLetterQueue.arn, ruleArns),
    },
    { parent, dependsOn: targets },
  );
  return {
    id: trigger.id,
    targetFunctionId: trigger.targetFunctionId,
    queue,
    deadLetterQueue,
    queuePolicy,
    deadLetterQueuePolicy,
    redriveAllowPolicy,
    rules,
    targets,
    maxReceiveCount: trigger.maxReceiveCount,
    worker: workerConfiguration(trigger, queue, deadLetterQueue, busName, consumerRoleArn),
  };
}

function workerConfiguration(
  trigger: NormalizedEventTrigger,
  queue: aws.sqs.Queue,
  deadLetterQueue: aws.sqs.Queue,
  busName: pulumi.Input<string>,
  consumerRoleArn: pulumi.Input<string>,
): ZsysEventWorkerConfiguration {
  const environment = pulumi
    .all({
      eventBusName: busName,
      consumerRoleArn,
      queueArn: queue.arn,
      queueUrl: queue.url,
      deadLetterQueueArn: deadLetterQueue.arn,
    })
    .apply(
      ({
        eventBusName,
        consumerRoleArn: role,
        queueArn,
        queueUrl,
        deadLetterQueueArn,
      }): Record<string, string> => ({
        ZSYS_EVENT_TRIGGER_ID: trigger.id,
        ZSYS_EVENT_TARGET_FUNCTION_ID: trigger.targetFunctionId,
        ZSYS_EVENT_BUS_NAME: String(eventBusName),
        ZSYS_EVENT_CONSUMER_ROLE_ARN: String(role),
        ZSYS_EVENT_QUEUE_ARN: String(queueArn),
        ZSYS_EVENT_QUEUE_URL: String(queueUrl),
        ZSYS_EVENT_DLQ_ARN: String(deadLetterQueueArn),
        ZSYS_EVENT_BATCH_SIZE: String(trigger.workerBatchSize),
        ZSYS_EVENT_CONCURRENCY: String(trigger.concurrency),
        ZSYS_EVENT_WAIT_TIME_SECONDS: String(trigger.workerWaitTimeSeconds),
        ZSYS_EVENT_VISIBILITY_TIMEOUT_SECONDS: String(trigger.visibilityTimeoutSeconds),
        ZSYS_EVENT_DELIVERY_SEMANTICS: "at-least-once",
        ZSYS_EVENT_ROUTING: "eventId+version",
        ZSYS_EVENT_ENVELOPE_PATH: "$.envelope",
        ZSYS_EVENT_TRACE_PATH: "$.envelope.traceId",
        ZSYS_EVENT_CORRELATION_PATH: "$.envelope.correlationId",
        ZSYS_EVENT_CAUSATION_PATH: "$.envelope.causationInvocationId",
      }),
    );
  return {
    eventTriggerId: trigger.id,
    targetFunctionId: trigger.targetFunctionId,
    queueArn: queue.arn,
    queueUrl: queue.url,
    deadLetterQueueArn: deadLetterQueue.arn,
    expansion: trigger.expansion.map(({ pair }) => pair),
    batchSize: trigger.workerBatchSize,
    concurrency: trigger.concurrency,
    waitTimeSeconds: trigger.workerWaitTimeSeconds,
    visibilityTimeoutSeconds: trigger.visibilityTimeoutSeconds,
    deliverySemantics: "at-least-once",
    envelopePath: "$.envelope",
    tracePath: "$.envelope.traceId",
    correlationPath: "$.envelope.correlationId",
    causationPath: "$.envelope.causationInvocationId",
    environment,
  };
}
