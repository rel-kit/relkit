import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { iamRoleName } from "../common.js";

const EXECUTION_POLICY_ARN =
  "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy";
const ASSUME_ROLE_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
});

export interface ServiceFoundation {
  readonly cluster: aws.ecs.Cluster;
  readonly executionRole: aws.iam.Role;
  readonly executionAttachment: aws.iam.RolePolicyAttachment;
  readonly taskRole: aws.iam.Role;
  readonly logGroup: aws.cloudwatch.LogGroup;
}

export function createFoundation(
  componentName: string,
  tags: pulumi.Input<Record<string, pulumi.Input<string>>>,
  retentionInDays: pulumi.Input<number>,
  parent: pulumi.ComponentResource,
): ServiceFoundation {
  const executionRoleName = iamRoleName(componentName, "execution-role");
  const taskRoleName = iamRoleName(componentName, "task-role");
  const cluster = new aws.ecs.Cluster(
    `${componentName}-cluster`,
    {
      name: `${componentName}-cluster`,
      settings: [{ name: "containerInsights", value: "enabled" }],
      tags,
    },
    { parent },
  );
  const executionRole = new aws.iam.Role(
    executionRoleName,
    {
      name: executionRoleName,
      assumeRolePolicy: ASSUME_ROLE_POLICY,
      tags,
    },
    { parent },
  );
  const executionAttachment = new aws.iam.RolePolicyAttachment(
    `${componentName}-execution-policy`,
    {
      role: executionRole.name,
      policyArn: EXECUTION_POLICY_ARN,
    },
    { parent },
  );
  const taskRole = new aws.iam.Role(
    taskRoleName,
    {
      name: taskRoleName,
      assumeRolePolicy: ASSUME_ROLE_POLICY,
      tags,
    },
    { parent },
  );
  const logGroup = new aws.cloudwatch.LogGroup(
    `${componentName}-logs`,
    {
      name: `/relkit/${componentName}`,
      retentionInDays,
      tags,
    },
    { parent },
  );
  return { cluster, executionRole, executionAttachment, taskRole, logGroup };
}
