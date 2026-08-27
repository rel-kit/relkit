import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { iamRoleName } from "../common.js";

const CONSUMER_ACTIONS = [
  "sqs:ReceiveMessage",
  "sqs:DeleteMessage",
  "sqs:ChangeMessageVisibility",
  "sqs:GetQueueAttributes",
];

export function createConsumerRole(
  name: string,
  tags: pulumi.Input<Record<string, pulumi.Input<string>>>,
  parent: pulumi.Resource,
): aws.iam.Role {
  const roleName = iamRoleName(name, "consumer-role");
  return new aws.iam.Role(
    roleName,
    {
      name: roleName,
      assumeRolePolicy: pulumi.output(
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "ecs-tasks.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      ),
      tags,
    },
    { parent },
  );
}

export function createConsumerPolicy(
  name: string,
  role: aws.iam.Role,
  queueArns: readonly pulumi.Input<string>[],
  parent: pulumi.Resource,
): aws.iam.RolePolicy {
  return new aws.iam.RolePolicy(
    `${name}-consumer-policy`,
    {
      name: `${name}-consumer-policy`.slice(0, 128),
      role: role.name,
      policy: pulumi.all([...queueArns]).apply((resources) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [{ Effect: "Allow", Action: CONSUMER_ACTIONS, Resource: resources }],
        }),
      ),
    },
    { parent },
  );
}

export function eventTargetPolicyJson(
  queueArn: pulumi.Input<string>,
  ruleArns: readonly pulumi.Input<string>[],
): pulumi.Output<string> {
  return pulumi.all([queueArn, ...ruleArns]).apply((values) => {
    const [resource, ...rules] = values as unknown as readonly [string, ...string[]];
    return JSON.stringify({
      Version: "2012-10-17",
      Statement: rules.map((ruleArn, index) => ({
        Sid: `EventBridgeSend${index + 1}`,
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: "sqs:SendMessage",
        Resource: resource,
        Condition: { ArnEquals: { "aws:SourceArn": ruleArn } },
      })),
    });
  });
}

export function redriveAllowPolicyJson(queueArn: pulumi.Input<string>): pulumi.Output<string> {
  return pulumi.output(
    pulumi.jsonStringify({
      redrivePermission: "byQueue",
      sourceQueueArns: [queueArn],
    }),
  );
}
