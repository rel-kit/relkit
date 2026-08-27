import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { awsRegion, environmentName, resourceName, tagsFor } from "../common.js";
import { normalizeBuckets } from "./validation.js";
import type { RelkitBucketResource, RelkitBucketsArgs } from "./types.js";

export * from "./types.js";

/** Maps logical buckets to stable, private-by-default S3 buckets. */
export class RelkitBuckets extends pulumi.ComponentResource {
  readonly buckets: readonly RelkitBucketResource[];
  readonly bucketResources: readonly RelkitBucketResource[];
  readonly tags: pulumi.Output<Record<string, string>>;

  constructor(name: string, args: RelkitBucketsArgs, opts: pulumi.ComponentResourceOptions = {}) {
    const definitions = normalizeBuckets(args);
    const componentName = resourceName(name, "buckets", args, 64);
    super("relkit:cloud-aws:RelkitBuckets", componentName, {}, opts);
    this.tags = tagsFor(name, args);
    const region = awsRegion(args);
    this.buckets = definitions.map((definition) => {
      const childName = resourceName(name, `${definition.id}-bucket`, args, 63);
      const bucket = new aws.s3.Bucket(
        childName,
        {
          bucket: definition.bucketName ?? childName,
          acl: definition.visibility === "public" ? "public-read" : "private",
          forceDestroy: definition.forceDestroy ?? false,
          ...(definition.versioned === undefined
            ? {}
            : { versioning: { enabled: definition.versioned } }),
          region,
          tags: this.tags,
        },
        { parent: this },
      );
      return {
        id: definition.id,
        bucket,
        arn: bucket.arn,
        name: bucket.bucket,
        visibility: definition.visibility,
        environment: {
          name: environmentName("bucket", definition.id, "NAME"),
          value: bucket.bucket,
        },
      };
    });
    this.bucketResources = this.buckets;
    this.registerOutputs({
      bucketArns: this.buckets.map(({ arn }) => arn),
      bucketNames: this.buckets.map(({ name }) => name),
    });
  }
}
