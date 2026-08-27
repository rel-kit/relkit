import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  DEFAULT_LIVENESS_PATH,
  DEFAULT_READINESS_PATH,
  DEFAULT_SERVICE_PORT,
  resourceName,
  tagsFor,
  validatePath,
  validatePort,
} from "../common.js";
import type { RelkitApplicationServiceArgs } from "./types.js";
import { containerDefinitions } from "./container.js";
import { createFoundation } from "./foundation.js";

export type { RelkitApplicationServiceArgs } from "./types.js";
/** ECS/Fargate application behind an internet-facing ALB with safe deployment defaults. */
export class RelkitApplicationService extends pulumi.ComponentResource {
  readonly cluster: aws.ecs.Cluster;
  readonly loadBalancer: aws.lb.LoadBalancer;
  readonly targetGroup: aws.lb.TargetGroup;
  readonly listener: aws.lb.Listener;
  readonly logGroup: aws.cloudwatch.LogGroup;
  readonly executionRole: aws.iam.Role;
  readonly taskRole: aws.iam.Role;
  readonly taskDefinition: aws.ecs.TaskDefinition;
  readonly service: aws.ecs.Service;
  readonly scalableTarget: aws.appautoscaling.Target;
  readonly scalingPolicy: aws.appautoscaling.Policy;
  readonly image: pulumi.Output<string>;
  readonly tags: pulumi.Output<Record<string, string>>;
  constructor(
    name: string,
    args: RelkitApplicationServiceArgs,
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    const componentName = resourceName(name, "service", args);
    super("relkit:cloud-aws:RelkitApplicationService", componentName, {}, opts);
    const tags = tagsFor(name, args);
    const port = args.containerPort ?? DEFAULT_SERVICE_PORT;
    const containerName = args.containerName ?? "app";
    const livenessPath = args.livenessPath ?? DEFAULT_LIVENESS_PATH;
    const readinessPath = args.readinessPath ?? DEFAULT_READINESS_PATH;
    const stopTimeout = args.stopTimeoutSeconds ?? 30;
    const deregistrationDelay = args.deregistrationDelaySeconds ?? 30;
    validatePort(port, "containerPort");
    validatePath(livenessPath, "livenessPath");
    validatePath(readinessPath, "readinessPath");
    if (!Number.isSafeInteger(stopTimeout) || stopTimeout < 2 || stopTimeout > 120)
      throw new RangeError("stopTimeoutSeconds must be an integer between 2 and 120.");
    if (
      !Number.isSafeInteger(deregistrationDelay) ||
      deregistrationDelay < 0 ||
      deregistrationDelay > 3600
    )
      throw new RangeError("deregistrationDelaySeconds must be an integer between 0 and 3600.");
    this.tags = tags;
    const foundation = createFoundation(componentName, tags, args.logRetentionDays ?? 30, this);
    this.cluster = foundation.cluster;
    this.executionRole = foundation.executionRole;
    this.taskRole = foundation.taskRole;
    this.logGroup = foundation.logGroup;
    this.image = pulumi.output(args.image ?? args.registry.imageUri(args.imageTag ?? "latest"));
    this.targetGroup = new aws.lb.TargetGroup(
      `${componentName}-target`,
      {
        name: resourceName(name, "target", args, 32),
        vpcId: args.network.vpcId,
        targetType: "ip",
        port,
        protocol: "HTTP",
        deregistrationDelay,
        healthCheck: {
          enabled: true,
          path: readinessPath,
          protocol: "HTTP",
          matcher: "200-399",
          interval: 30,
          timeout: 5,
          healthyThreshold: 2,
          unhealthyThreshold: 3,
        },
        tags,
      },
      { parent: this },
    );
    this.loadBalancer = new aws.lb.LoadBalancer(
      `${componentName}-alb`,
      {
        name: resourceName(name, "alb", args, 32),
        loadBalancerType: "application",
        internal: args.internalLoadBalancer ?? false,
        securityGroups: [args.network.loadBalancerSecurityGroupId],
        subnets: args.network.publicSubnetIds,
        enableDeletionProtection: false,
        tags,
      },
      { parent: this },
    );
    this.listener = new aws.lb.Listener(
      `${componentName}-listener`,
      {
        loadBalancerArn: this.loadBalancer.arn,
        port: 80,
        protocol: "HTTP",
        defaultActions: [{ type: "forward", targetGroupArn: this.targetGroup.arn }],
      },
      { parent: this },
    );
    this.taskDefinition = new aws.ecs.TaskDefinition(
      `${componentName}-task`,
      {
        family: `${componentName}-task`,
        requiresCompatibilities: ["FARGATE"],
        networkMode: "awsvpc",
        cpu: args.cpu ?? "256",
        memory: args.memory ?? "512",
        executionRoleArn: this.executionRole.arn,
        taskRoleArn: this.taskRole.arn,
        containerDefinitions: containerDefinitions(
          this.image,
          this.logGroup.name,
          port,
          livenessPath,
          stopTimeout,
          containerName,
          args.environment,
          args.secrets,
        ),
        tags,
      },
      { parent: this, dependsOn: [foundation.executionAttachment] },
    );
    this.service = new aws.ecs.Service(
      `${componentName}-service`,
      {
        name: `${componentName}-service`,
        cluster: this.cluster.arn,
        taskDefinition: this.taskDefinition.arn,
        launchType: "FARGATE",
        desiredCount: args.desiredCount ?? 1,
        healthCheckGracePeriodSeconds: args.healthCheckGracePeriodSeconds ?? 60,
        deploymentCircuitBreaker: { enable: true, rollback: true },
        deploymentMinimumHealthyPercent: 100,
        deploymentMaximumPercent: 200,
        enableEcsManagedTags: true,
        propagateTags: "SERVICE",
        networkConfiguration: {
          assignPublicIp: false,
          subnets: args.network.privateSubnetIds,
          securityGroups: [args.network.serviceSecurityGroupId],
        },
        loadBalancers: [
          {
            targetGroupArn: this.targetGroup.arn,
            containerName,
            containerPort: port,
          },
        ],
        tags,
      },
      { parent: this, dependsOn: [this.listener] },
    );
    this.scalableTarget = new aws.appautoscaling.Target(
      `${componentName}-scalable-target`,
      {
        serviceNamespace: "ecs",
        scalableDimension: "ecs:service:DesiredCount",
        resourceId: pulumi.interpolate`service/${this.cluster.name}/${this.service.name}`,
        minCapacity: args.minCapacity ?? 1,
        maxCapacity: args.maxCapacity ?? 4,
        tags,
      },
      { parent: this, dependsOn: [this.service] },
    );
    this.scalingPolicy = new aws.appautoscaling.Policy(
      `${componentName}-cpu-scaling`,
      {
        serviceNamespace: "ecs",
        scalableDimension: "ecs:service:DesiredCount",
        resourceId: this.scalableTarget.resourceId,
        policyType: "TargetTrackingScaling",
        targetTrackingScalingPolicyConfiguration: {
          targetValue: args.cpuTargetPercent ?? 70,
          predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageCPUUtilization",
          },
          scaleInCooldown: 60,
          scaleOutCooldown: 60,
        },
      },
      { parent: this, dependsOn: [this.scalableTarget] },
    );
    this.registerOutputs({
      service: this.service,
      loadBalancer: this.loadBalancer,
      image: this.image,
    });
  }
}
