import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import {
  DEFAULT_SERVICE_PORT,
  resourceName,
  tagsFor,
  validatePort,
  type RelkitComponentArgs,
} from "../common.js";

export interface RelkitNetworkArgs extends RelkitComponentArgs {
  readonly cidrBlock?: string;
  readonly numberOfAvailabilityZones?: number;
  readonly availabilityZoneNames?: string[];
  readonly natGatewayStrategy?: "None" | "Single" | "OnePerAz";
  readonly servicePort?: number;
}

/** Shared VPC, subnet, and security-group boundary for AWS application resources. */
export class RelkitNetwork extends pulumi.ComponentResource {
  readonly vpc: awsx.ec2.Vpc;
  readonly vpcId: pulumi.Output<string>;
  readonly publicSubnetIds: pulumi.Output<string[]>;
  readonly privateSubnetIds: pulumi.Output<string[]>;
  readonly loadBalancerSecurityGroup: aws.ec2.SecurityGroup;
  readonly serviceSecurityGroup: aws.ec2.SecurityGroup;
  readonly loadBalancerSecurityGroupId: pulumi.Output<string>;
  readonly serviceSecurityGroupId: pulumi.Output<string>;
  readonly tags: pulumi.Output<Record<string, string>>;

  constructor(
    name: string,
    args: RelkitNetworkArgs = {},
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    const componentName = resourceName(name, "network", args);
    super("relkit:cloud-aws:RelkitNetwork", componentName, {}, opts);
    const tags = tagsFor(name, args);
    const servicePort = args.servicePort ?? DEFAULT_SERVICE_PORT;
    validatePort(servicePort, "servicePort");

    this.tags = tags;
    this.vpc = new awsx.ec2.Vpc(
      `${componentName}-vpc`,
      {
        cidrBlock: args.cidrBlock ?? "10.0.0.0/16",
        numberOfAvailabilityZones: args.numberOfAvailabilityZones ?? 2,
        ...(args.availabilityZoneNames === undefined
          ? {}
          : { availabilityZoneNames: args.availabilityZoneNames }),
        natGateways: { strategy: args.natGatewayStrategy ?? "Single" },
        subnetNameTagStrategy: "AvailabilityZone",
        tags,
      },
      { parent: this },
    );
    this.vpcId = this.vpc.vpcId;
    this.publicSubnetIds = this.vpc.publicSubnetIds;
    this.privateSubnetIds = this.vpc.privateSubnetIds;

    this.loadBalancerSecurityGroup = new aws.ec2.SecurityGroup(
      `${componentName}-alb-sg`,
      {
        name: `${componentName}-alb-sg`,
        description: "RelKit public application load balancer",
        vpcId: this.vpcId,
        ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] }],
        egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
        tags,
      },
      { parent: this },
    );
    this.serviceSecurityGroup = new aws.ec2.SecurityGroup(
      `${componentName}-service-sg`,
      {
        name: `${componentName}-service-sg`,
        description: "RelKit private application service",
        vpcId: this.vpcId,
        ingress: [
          {
            fromPort: servicePort,
            toPort: servicePort,
            protocol: "tcp",
            securityGroups: [this.loadBalancerSecurityGroup.id],
          },
        ],
        egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
        tags,
      },
      { parent: this },
    );
    this.loadBalancerSecurityGroupId = this.loadBalancerSecurityGroup.id;
    this.serviceSecurityGroupId = this.serviceSecurityGroup.id;
    this.registerOutputs({
      vpcId: this.vpcId,
      publicSubnetIds: this.publicSubnetIds,
      privateSubnetIds: this.privateSubnetIds,
      loadBalancerSecurityGroupId: this.loadBalancerSecurityGroupId,
      serviceSecurityGroupId: this.serviceSecurityGroupId,
    });
  }
}
