import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { ZsysComponentArgs, ZsysEnvironmentVariable } from "../common.js";

export type ZsysBucketVisibility = "private" | "public";

export interface ZsysBucketDefinition {
  readonly id: string;
  readonly visibility?: ZsysBucketVisibility;
  readonly bucketName?: pulumi.Input<string>;
  readonly forceDestroy?: pulumi.Input<boolean>;
  readonly versioned?: pulumi.Input<boolean>;
}

export interface ZsysBucketsArgs extends ZsysComponentArgs {
  readonly buckets: readonly ZsysBucketDefinition[];
}

export interface ZsysBucketResource {
  readonly id: string;
  readonly bucket: aws.s3.Bucket;
  readonly arn: pulumi.Output<string>;
  readonly name: pulumi.Output<string>;
  readonly visibility: ZsysBucketVisibility;
  readonly environment: ZsysEnvironmentVariable;
}
