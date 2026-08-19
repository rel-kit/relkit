import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { iamRoleName } from "../common.js";
import type { NormalizedJobQueue } from "./validation.js";
import type { ZsysJobQueueResource } from "./types.js";
import { queuePolicyJson, sendPolicyJson, trustPolicy } from "./policies.js";

type QueueResourceBase = Omit<ZsysJobQueueResource, "worker" | "retry">;

export function createWorkerRole(
  name: string,
  tags: pulumi.Input<Record<string, pulumi.Input<string>>>,
  parent: pulumi.Resource,
): aws.iam.Role {
  const roleName = iamRoleName(name, "worker-role");
  return new aws.iam.Role(
    roleName,
    { name: roleName, assumeRolePolicy: trustPolicy("ecs-tasks.amazonaws.com"), tags },
    { parent },
  );
}

export function createSchedulerRole(
  name: string,
  tags: pulumi.Input<Record<string, pulumi.Input<string>>>,
  parent: pulumi.Resource,
): aws.iam.Role {
  const roleName = iamRoleName(name, "scheduler-role");
  return new aws.iam.Role(
    roleName,
    { name: roleName, assumeRolePolicy: trustPolicy("scheduler.amazonaws.com"), tags },
    { parent },
  );
}

export function createQueueResources(
  componentName: string,
  job: NormalizedJobQueue,
  tags: pulumi.Input<Record<string, pulumi.Input<string>>>,
  workerRoleArn: pulumi.Input<string>,
  schedulerRoleArn: pulumi.Input<string> | undefined,
  parent: pulumi.Resource,
): QueueResourceBase {
  const queueName = childName(componentName, job.id, "queue", 76);
  const deadLetterQueue = new aws.sqs.Queue(
    `${queueName}-dlq`,
    {
      name: `${queueName}-dlq`.slice(0, 80),
      messageRetentionSeconds: job.deadLetterRetentionSeconds,
      sqsManagedSseEnabled: true,
      tags,
    },
    { parent },
  );
  const queue = new aws.sqs.Queue(
    queueName,
    {
      name: queueName,
      messageRetentionSeconds: job.messageRetentionSeconds,
      receiveWaitTimeSeconds: job.workerWaitTimeSeconds,
      visibilityTimeoutSeconds: job.visibilityTimeoutSeconds,
      redrivePolicy: pulumi.jsonStringify({
        deadLetterTargetArn: deadLetterQueue.arn,
        maxReceiveCount: job.maxReceiveCount,
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
      redriveAllowPolicy: pulumi.jsonStringify({
        redrivePermission: "byQueue",
        sourceQueueArns: [queue.arn],
      }),
    },
    { parent, dependsOn: [queue] },
  );
  const queuePolicy = new aws.sqs.QueuePolicy(
    `${queueName}-policy`,
    { queueUrl: queue.url, policy: queuePolicyJson(queue.arn, workerRoleArn, schedulerRoleArn) },
    { parent, dependsOn: [queue, deadLetterQueue] },
  );
  const deadLetterQueuePolicy =
    schedulerRoleArn === undefined
      ? undefined
      : new aws.sqs.QueuePolicy(
          `${queueName}-dlq-policy`,
          {
            queueUrl: deadLetterQueue.url,
            policy: sendPolicyJson(deadLetterQueue.arn, schedulerRoleArn),
          },
          { parent, dependsOn: [deadLetterQueue] },
        );
  return {
    id: job.id,
    queue,
    deadLetterQueue,
    queuePolicy,
    ...(deadLetterQueuePolicy === undefined ? {} : { deadLetterQueuePolicy }),
    redriveAllowPolicy,
    maxReceiveCount: job.maxReceiveCount,
  };
}

export function childName(
  componentName: string,
  id: string,
  kind: string,
  maxLength = 255,
): string {
  const normalized = `${componentName}-${id}-${kind}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, maxLength).replace(/-+$/, "") || "zsys";
}
