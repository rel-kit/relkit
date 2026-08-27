import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { RelkitNetwork } from "../RelkitNetwork/index.js";
import type { RelkitComponentArgs, RelkitEnvironmentVariable } from "../common.js";

export interface RelkitCacheDefinition {
  readonly id: string;
  readonly engineVersion?: pulumi.Input<string>;
  readonly maxDataStorageGb?: pulumi.Input<number>;
  readonly maxEcpuPerSecond?: pulumi.Input<number>;
  readonly subnetIds?: pulumi.Input<pulumi.Input<string>[]>;
  readonly securityGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
}

export interface RelkitCachesArgs extends RelkitComponentArgs {
  readonly caches: readonly RelkitCacheDefinition[];
  readonly network?: RelkitNetwork;
  readonly engineVersion?: pulumi.Input<string>;
  readonly kmsKeyId?: pulumi.Input<string>;
}

export interface RelkitCacheEndpoint {
  readonly address: string;
  readonly port: number;
}

export interface RelkitCacheResource {
  readonly id: string;
  readonly cache: aws.elasticache.ServerlessCache;
  readonly arn: pulumi.Output<string>;
  readonly endpoint: pulumi.Output<RelkitCacheEndpoint>;
  readonly url: pulumi.Output<string>;
  readonly environment: RelkitEnvironmentVariable;
}
