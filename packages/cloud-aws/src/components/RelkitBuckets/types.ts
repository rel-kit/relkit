import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { RelkitComponentArgs, RelkitEnvironmentVariable } from "../common.js";

export type RelkitBucketVisibility = "private" | "public";

export interface RelkitBucketDefinition {
  readonly id: string;
  readonly visibility?: RelkitBucketVisibility;
  readonly bucketName?: pulumi.Input<string>;
  readonly forceDestroy?: pulumi.Input<boolean>;
  readonly versioned?: pulumi.Input<boolean>;
}

export interface RelkitBucketsArgs extends RelkitComponentArgs {
  readonly buckets: readonly RelkitBucketDefinition[];
}

export interface RelkitBucketResource {
  readonly id: string;
  readonly bucket: aws.s3.Bucket;
  readonly arn: pulumi.Output<string>;
  readonly name: pulumi.Output<string>;
  readonly visibility: RelkitBucketVisibility;
  readonly environment: RelkitEnvironmentVariable;
}
