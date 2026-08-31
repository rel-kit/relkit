import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { childResourceName } from "./names.js";
import { eventTargetPolicyJson, redriveAllowPolicyJson } from "./policies.js";
import {
  eventPattern,
  type NormalizedEventBridgeRetryPolicy,
  type NormalizedEventTrigger,
} from "./validation.js";
import type { RelkitEventTriggerResource, RelkitEventWorkerConfiguration } from "./types.js";

export function createTriggerResources(
  componentName: string,
  busName: pulumi.Input<string>,
  source: string,
  retryPolicy: NormalizedEventBridgeRetryPolicy,
  trigger: NormalizedEventTrigger,
  tags: pulumi.Input<Record<string, pulumi.Input<string>>>,
  consumerRoleArn: pulumi.Input<string>,
  parent: pulumi.Resource,
): RelkitEventTriggerResource {
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
  const event = trigger.event;
  const rules = [
    new aws.cloudwatch.EventRule(
      childResourceName(componentName, `${trigger.id}-${event.pair}`, "rule", 64),
      {
        name: childResourceName(componentName, `${trigger.id}-${event.pair}`, "rule", 64),
        description: `RelKit event trigger ${trigger.id} routes ${event.pair}`,
        eventBusName: busName,
        eventPattern: eventPattern(source, event),
        state: "ENABLED",
        tags,
      },
      { parent },
    ),
  ];
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
): RelkitEventWorkerConfiguration {
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
        RELKIT_EVENT_TRIGGER_ID: trigger.id,
        RELKIT_EVENT_TARGET_FUNCTION_ID: trigger.targetFunctionId,
        RELKIT_EVENT_BUS_NAME: String(eventBusName),
        RELKIT_EVENT_CONSUMER_ROLE_ARN: String(role),
        RELKIT_EVENT_QUEUE_ARN: String(queueArn),
        RELKIT_EVENT_QUEUE_URL: String(queueUrl),
        RELKIT_EVENT_DLQ_ARN: String(deadLetterQueueArn),
        RELKIT_EVENT_BATCH_SIZE: String(trigger.workerBatchSize),
        ...(trigger.concurrency === undefined
          ? {}
          : { RELKIT_EVENT_CONCURRENCY: String(trigger.concurrency) }),
        RELKIT_EVENT_ID: trigger.event.id,
        RELKIT_EVENT_VERSION: String(trigger.event.version),
        RELKIT_EVENT_WAIT_TIME_SECONDS: String(trigger.workerWaitTimeSeconds),
        RELKIT_EVENT_VISIBILITY_TIMEOUT_SECONDS: String(trigger.visibilityTimeoutSeconds),
        RELKIT_EVENT_DELIVERY_SEMANTICS: "at-least-once",
        RELKIT_EVENT_ROUTING: "eventId+version",
        RELKIT_EVENT_ENVELOPE_PATH: "$.envelope",
        RELKIT_EVENT_TRACE_PATH: "$.envelope.traceId",
        RELKIT_EVENT_CORRELATION_PATH: "$.envelope.correlationId",
        RELKIT_EVENT_CAUSATION_PATH: "$.envelope.causationInvocationId",
      }),
    );
  return {
    eventTriggerId: trigger.id,
    targetFunctionId: trigger.targetFunctionId,
    queueArn: queue.arn,
    queueUrl: queue.url,
    deadLetterQueueArn: deadLetterQueue.arn,
    eventId: trigger.event.id,
    eventVersion: trigger.event.version,
    batchSize: trigger.workerBatchSize,
    ...(trigger.concurrency === undefined ? {} : { concurrency: trigger.concurrency }),
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
