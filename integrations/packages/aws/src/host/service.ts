import {
  deploymentJoin,
  deploymentJson,
  type DeploymentHostMaterialization,
  type DeploymentResourceOperation,
} from "@relkit/deploy";
import { type HostContext, name, output, resource } from "./shared.js";
import { container, role } from "./service-support.js";

const EXECUTION_POLICY = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy";

export function service(
  context: HostContext,
  network: DeploymentHostMaterialization["network"],
): Pick<DeploymentHostMaterialization, "resources" | "workload" | "outputs"> {
  const resources: DeploymentResourceOperation[] = [
    resource(
      context,
      "registry",
      "aws:ecr/repository:Repository",
      {
        imageTagMutability: "IMMUTABLE",
        imageScanningConfiguration: { scanOnPush: true },
        forceDelete: false,
        tags: context.tags,
      },
      ["arn", "repositoryUrl"],
    ),
    resource(
      context,
      "log-group",
      "aws:cloudwatch/logGroup:LogGroup",
      { retentionInDays: 30, tags: context.tags },
      ["arn", "name"],
    ),
    role(context, "execution-role"),
    resource(context, "execution-policy", "aws:iam/rolePolicyAttachment:RolePolicyAttachment", {
      role: output("execution-role", "name"),
      policyArn: EXECUTION_POLICY,
    }),
    role(context, "task-role"),
    resource(
      context,
      "cluster",
      "aws:ecs/cluster:Cluster",
      { settings: [{ name: "containerInsights", value: "enabled" }], tags: context.tags },
      ["arn", "name"],
    ),
    resource(
      context,
      "target-group",
      "aws:lb/targetGroup:TargetGroup",
      {
        vpcId: network.vpcId,
        targetType: "ip",
        port: context.plan.http.port,
        protocol: "HTTP",
        deregistrationDelay: 30,
        healthCheck: {
          enabled: true,
          path: context.plan.http.health.readinessPath,
          protocol: "HTTP",
          matcher: "200-399",
        },
        tags: context.tags,
      },
      ["arn"],
    ),
    resource(
      context,
      "load-balancer",
      "aws:lb/loadBalancer:LoadBalancer",
      {
        loadBalancerType: "application",
        internal: false,
        securityGroups: [output("alb-security-group", "id")],
        subnets: network.subnetIds,
        tags: context.tags,
      },
      ["arn", "dnsName"],
    ),
    resource(
      context,
      "listener",
      "aws:lb/listener:Listener",
      {
        loadBalancerArn: output("load-balancer", "arn"),
        port: 80,
        protocol: "HTTP",
        defaultActions: [{ type: "forward", targetGroupArn: output("target-group", "arn") }],
      },
      ["arn"],
    ),
    resource(
      context,
      "task-definition",
      "aws:ecs/taskDefinition:TaskDefinition",
      {
        family: name(`${context.prefix}-task`),
        requiresCompatibilities: ["FARGATE"],
        networkMode: "awsvpc",
        cpu: "256",
        memory: "512",
        executionRoleArn: output("execution-role", "arn"),
        taskRoleArn: output("task-role", "arn"),
        containerDefinitions: deploymentJson([container(context)]),
        tags: context.tags,
      },
      ["arn"],
      ["execution-policy"],
    ),
    resource(
      context,
      "service",
      "aws:ecs/service:Service",
      {
        cluster: output("cluster", "arn"),
        taskDefinition: output("task-definition", "arn"),
        launchType: "FARGATE",
        desiredCount: 1,
        healthCheckGracePeriodSeconds: 60,
        deploymentCircuitBreaker: { enable: true, rollback: true },
        networkConfiguration: {
          assignPublicIp: true,
          subnets: network.subnetIds,
          securityGroups: [network.serviceSecurityGroupId],
        },
        loadBalancers: [
          {
            targetGroupArn: output("target-group", "arn"),
            containerName: "app",
            containerPort: context.plan.http.port,
          },
        ],
        tags: context.tags,
      },
      ["name"],
      ["listener"],
    ),
  ];
  return {
    resources,
    workload: {
      roleName: output("task-role", "name"),
      roleArn: output("task-role", "arn"),
    },
    outputs: {
      endpoint: deploymentJoin("http://", output("load-balancer", "dnsName")),
      registryUrl: output("registry", "repositoryUrl"),
      logGroupName: output("log-group", "name"),
    },
  };
}
