import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { awsRegion, boundedAwsName, environmentName, resourceName, tagsFor } from "../common.js";
import { childResourceName } from "../ZsysEventBus/names.js";
import { normalizeCaches } from "./validation.js";
import type { ZsysCacheEndpoint, ZsysCacheResource, ZsysCachesArgs } from "./types.js";

export * from "./client.js";
export * from "./types.js";

/** Maps logical caches to ElastiCache Valkey. */
export class ZsysCaches extends pulumi.ComponentResource {
  readonly caches: readonly ZsysCacheResource[];
  readonly cacheResources: readonly ZsysCacheResource[];
  readonly tags: pulumi.Output<Record<string, string>>;

  constructor(name: string, args: ZsysCachesArgs, opts: pulumi.ComponentResourceOptions = {}) {
    const definitions = normalizeCaches(args);
    const componentName = resourceName(name, "caches", args, 64);
    super("zsys:cloud-aws:ZsysCaches", componentName, {}, opts);
    this.tags = tagsFor(name, args);
    const region = awsRegion(args);
    this.caches = definitions.map((definition) => {
      const childName = boundedAwsName(
        childResourceName(componentName, definition.id, "valkey", 255),
        40,
      );
      const cache = new aws.elasticache.ServerlessCache(
        childName,
        {
          engine: "valkey",
          majorEngineVersion: definition.engineVersion ?? args.engineVersion ?? "7",
          name: childName,
          cacheUsageLimits: {
            dataStorage: {
              maximum: definition.maxDataStorageGb ?? 10,
              unit: "GB",
            },
            ecpuPerSeconds: [{ maximum: definition.maxEcpuPerSecond ?? 5_000 }],
          },
          ...(args.kmsKeyId === undefined ? {} : { kmsKeyId: args.kmsKeyId }),
          ...(definition.subnetIds === undefined && args.network === undefined
            ? {}
            : { subnetIds: definition.subnetIds ?? args.network?.privateSubnetIds }),
          ...(definition.securityGroupIds === undefined && args.network === undefined
            ? {}
            : {
                securityGroupIds:
                  definition.securityGroupIds ??
                  (args.network === undefined ? undefined : [args.network.serviceSecurityGroupId]),
              }),
          region,
          tags: this.tags,
        },
        { parent: this },
      );
      const endpoint = cache.endpoints.apply((endpoints): ZsysCacheEndpoint => {
        const first = endpoints[0];
        if (first === undefined) throw new Error(`AWS cache "${definition.id}" has no endpoint.`);
        return { address: first.address, port: first.port };
      });
      const url = endpoint.apply(({ address, port }) => `rediss://${address}:${port}`);
      return {
        id: definition.id,
        cache,
        arn: cache.arn,
        endpoint,
        url,
        environment: {
          name: environmentName("cache", definition.id, "URL"),
          value: url,
        },
      };
    });
    this.cacheResources = this.caches;
    this.registerOutputs({
      cacheArns: this.caches.map(({ arn }) => arn),
      cacheUrls: this.caches.map(({ url }) => url),
    });
  }
}
