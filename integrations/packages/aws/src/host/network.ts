import { deploymentJoin, type DeploymentHostMaterialization } from "@relkit/deploy";
import { type HostContext, output, resource } from "./shared.js";

export function network(
  context: HostContext,
): Pick<DeploymentHostMaterialization, "resources" | "network"> {
  const commonEgress = [
    { fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] },
  ] as const;
  const resources = [
    resource(
      context,
      "vpc",
      "aws:ec2/vpc:Vpc",
      {
        cidrBlock: "10.42.0.0/16",
        enableDnsHostnames: true,
        enableDnsSupport: true,
        tags: context.tags,
      },
      ["id"],
    ),
    resource(
      context,
      "internet-gateway",
      "aws:ec2/internetGateway:InternetGateway",
      { vpcId: output("vpc", "id"), tags: context.tags },
      ["id"],
    ),
    resource(
      context,
      "route-table",
      "aws:ec2/routeTable:RouteTable",
      {
        vpcId: output("vpc", "id"),
        routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: output("internet-gateway", "id") }],
        tags: context.tags,
      },
      ["id"],
    ),
    ...["a", "b"].map((zone, index) =>
      resource(
        context,
        `subnet-${zone}`,
        "aws:ec2/subnet:Subnet",
        {
          vpcId: output("vpc", "id"),
          cidrBlock: `10.42.${index}.0/24`,
          availabilityZone: deploymentJoin(context.region, zone),
          mapPublicIpOnLaunch: true,
          tags: context.tags,
        },
        ["id"],
      ),
    ),
    ...["a", "b"].map((zone) =>
      resource(context, `route-${zone}`, "aws:ec2/routeTableAssociation:RouteTableAssociation", {
        routeTableId: output("route-table", "id"),
        subnetId: output(`subnet-${zone}`, "id"),
      }),
    ),
    resource(
      context,
      "alb-security-group",
      "aws:ec2/securityGroup:SecurityGroup",
      {
        vpcId: output("vpc", "id"),
        description: "RelKit public load balancer",
        ingress: [{ fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] }],
        egress: commonEgress,
        tags: context.tags,
      },
      ["id"],
    ),
    resource(
      context,
      "service-security-group",
      "aws:ec2/securityGroup:SecurityGroup",
      {
        vpcId: output("vpc", "id"),
        description: "RelKit ECS service",
        ingress: [
          {
            fromPort: context.plan.http.port,
            toPort: context.plan.http.port,
            protocol: "tcp",
            securityGroups: [output("alb-security-group", "id")],
          },
        ],
        egress: commonEgress,
        tags: context.tags,
      },
      ["id"],
    ),
  ];
  return {
    resources,
    network: {
      vpcId: output("vpc", "id"),
      subnetIds: [output("subnet-a", "id"), output("subnet-b", "id")],
      serviceSecurityGroupId: output("service-security-group", "id"),
    },
  };
}
