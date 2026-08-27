import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const WORKER_ACTIONS = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility"];

export function createWorkerPolicy(
  name: string,
  role: aws.iam.Role,
  queueArns: readonly pulumi.Input<string>[],
  parent: pulumi.Resource,
): aws.iam.RolePolicy {
  return new aws.iam.RolePolicy(
    `${name}-worker-policy`,
    {
      name: `${name}-worker-policy`,
      role: role.name,
      policy: pulumi.all([...queueArns]).apply((resources) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [{ Effect: "Allow", Action: WORKER_ACTIONS, Resource: resources }],
        }),
      ),
    },
    { parent },
  );
}

export function createSchedulerPolicy(
  name: string,
  role: aws.iam.Role,
  queueArns: readonly pulumi.Input<string>[],
  deadLetterQueueArns: readonly pulumi.Input<string>[],
  parent: pulumi.Resource,
): aws.iam.RolePolicy {
  return new aws.iam.RolePolicy(
    `${name}-scheduler-policy`,
    {
      name: `${name}-scheduler-policy`,
      role: role.name,
      policy: pulumi.all([...queueArns, ...deadLetterQueueArns]).apply((resources) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [{ Effect: "Allow", Action: ["sqs:SendMessage"], Resource: resources }],
        }),
      ),
    },
    { parent },
  );
}

export function queuePolicyJson(
  queueArn: pulumi.Input<string>,
  workerRoleArn: pulumi.Input<string>,
  schedulerRoleArn: pulumi.Input<string> | undefined,
): pulumi.Output<string> {
  return pulumi
    .all({ queueArn, workerRoleArn, schedulerRoleArn: schedulerRoleArn ?? "" })
    .apply(({ queueArn: resource, workerRoleArn: worker, schedulerRoleArn: scheduler }) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "WorkerConsume",
            Effect: "Allow",
            Principal: { AWS: worker },
            Action: WORKER_ACTIONS,
            Resource: resource,
          },
          ...(scheduler === ""
            ? []
            : [
                {
                  Sid: "SchedulerSend",
                  Effect: "Allow",
                  Principal: { AWS: scheduler },
                  Action: "sqs:SendMessage",
                  Resource: resource,
                },
              ]),
        ],
      }),
    );
}

export function sendPolicyJson(
  queueArn: pulumi.Input<string>,
  schedulerRoleArn: pulumi.Input<string>,
): pulumi.Output<string> {
  return pulumi
    .all({ queueArn, schedulerRoleArn })
    .apply(({ queueArn: resource, schedulerRoleArn: scheduler }) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "SchedulerSend",
            Effect: "Allow",
            Principal: { AWS: scheduler },
            Action: "sqs:SendMessage",
            Resource: resource,
          },
        ],
      }),
    );
}

export function trustPolicy(service: string): pulumi.Output<string> {
  return pulumi.output(
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole" }],
    }),
  );
}
