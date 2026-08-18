import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { ZsysNetwork } from "../ZsysNetwork/index.js";
import type { ZsysComponentArgs, ZsysEnvironmentVariable } from "../common.js";

export interface ZsysCacheDefinition {
  readonly id: string;
  readonly engineVersion?: pulumi.Input<string>;
  readonly maxDataStorageGb?: pulumi.Input<number>;
  readonly maxEcpuPerSecond?: pulumi.Input<number>;
  readonly subnetIds?: pulumi.Input<pulumi.Input<string>[]>;
  readonly securityGroupIds?: pulumi.Input<pulumi.Input<string>[]>;
}

export interface ZsysCachesArgs extends ZsysComponentArgs {
  readonly caches: readonly ZsysCacheDefinition[];
  readonly network?: ZsysNetwork;
  readonly engineVersion?: pulumi.Input<string>;
  readonly kmsKeyId?: pulumi.Input<string>;
}

export interface ZsysCacheEndpoint {
  readonly address: string;
  readonly port: number;
}

export interface ZsysCacheResource {
  readonly id: string;
  readonly cache: aws.elasticache.ServerlessCache;
  readonly arn: pulumi.Output<string>;
  readonly endpoint: pulumi.Output<ZsysCacheEndpoint>;
  readonly url: pulumi.Output<string>;
  readonly environment: ZsysEnvironmentVariable;
}
