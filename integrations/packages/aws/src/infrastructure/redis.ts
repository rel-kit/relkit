import {
  deploymentJoin,
  type DeploymentHostMaterialization,
  type DeploymentInfrastructureMaterialization,
  type DeploymentPlan,
  type InfrastructureOperationPlan,
} from "@relkit/deploy";
import { assertAdapter, context, name, output, resource, settings } from "./shared.js";

export function materializeRedis(
  plan: DeploymentPlan,
  stackName: string,
  operation: InfrastructureOperationPlan,
  host: DeploymentHostMaterialization,
): DeploymentInfrastructureMaterialization {
  assertAdapter(operation, "cache", "redis", ["atomicIncrement"]);
  const value = context(plan.application.id, plan.graphHash, stackName, operation);
  const options = settings(operation.integration.configuration);
  const engine = options.engine ?? "valkey";
  const nodeType = options.nodeType ?? "cache.t4g.micro";
  const replicas = options.replicas ?? 0;
  assertOptions(engine, nodeType, replicas, options);
  const resources = [
    resource(
      value,
      "security-group",
      "aws:ec2/securityGroup:SecurityGroup",
      {
        vpcId: host.network.vpcId,
        description: "RelKit managed cache",
        egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
        tags: value.tags,
      },
      ["id"],
    ),
    resource(
      value,
      "subnet-group",
      "aws:elasticache/subnetGroup:SubnetGroup",
      { subnetIds: host.network.subnetIds, tags: value.tags },
      ["name"],
    ),
    resource(
      value,
      "replication-group",
      "aws:elasticache/replicationGroup:ReplicationGroup",
      {
        replicationGroupId: name(value.prefix, 40),
        description: `RelKit ${operation.bindingId}`,
        engine: engine as string,
        nodeType: nodeType as string,
        numCacheClusters: Number(replicas) + 1,
        automaticFailoverEnabled: Number(replicas) > 0,
        multiAzEnabled: Number(replicas) > 0,
        transitEncryptionEnabled: true,
        atRestEncryptionEnabled: true,
        port: 6379,
        subnetGroupName: output(value, "subnet-group", "name"),
        securityGroupIds: [output(value, "security-group", "id")],
        tags: value.tags,
      },
      ["arn", "primaryEndpointAddress", "port"],
    ),
  ];
  return {
    resources,
    connection: {
      url: deploymentJoin(
        "rediss://",
        output(value, "replication-group", "primaryEndpointAddress"),
        ":",
        output(value, "replication-group", "port"),
      ),
    },
    access: {
      securityGroupId: output(value, "security-group", "id"),
      port: 6379,
      cacheArn: output(value, "replication-group", "arn"),
    },
  };
}

function assertOptions(
  engine: unknown,
  nodeType: unknown,
  replicas: unknown,
  options: Readonly<Record<string, unknown>>,
): void {
  for (const key of Object.keys(options))
    if (!["engine", "nodeType", "replicas"].includes(key))
      throw new TypeError(`Unknown AWS Redis option "${key}".`);
  if (engine !== "valkey" && engine !== "redis")
    throw new TypeError("AWS Redis engine is invalid.");
  if (typeof nodeType !== "string" || !/^cache\.[a-z0-9.-]+$/i.test(nodeType))
    throw new TypeError("AWS Redis nodeType is invalid.");
  if (!Number.isSafeInteger(replicas) || Number(replicas) < 0 || Number(replicas) > 5)
    throw new TypeError("AWS Redis replicas are invalid.");
}
