import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { resourceName, tagsFor, type RelkitComponentArgs } from "../common.js";

export interface RelkitContainerRegistryArgs extends RelkitComponentArgs {
  readonly repositoryName?: pulumi.Input<string>;
  readonly imageTagMutability?: pulumi.Input<"MUTABLE" | "IMMUTABLE">;
  readonly scanOnPush?: pulumi.Input<boolean>;
  readonly forceDelete?: pulumi.Input<boolean>;
}

/** ECR repository with immutable deploy identities and image scanning enabled. */
export class RelkitContainerRegistry extends pulumi.ComponentResource {
  readonly repository: aws.ecr.Repository;
  readonly repositoryArn: pulumi.Output<string>;
  readonly repositoryUrl: pulumi.Output<string>;
  readonly tags: pulumi.Output<Record<string, string>>;

  constructor(
    name: string,
    args: RelkitContainerRegistryArgs = {},
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    const componentName = resourceName(name, "registry", args);
    super("relkit:cloud-aws:RelkitContainerRegistry", componentName, {}, opts);
    this.tags = tagsFor(name, args);
    this.repository = new aws.ecr.Repository(
      componentName,
      {
        name: args.repositoryName ?? componentName,
        imageTagMutability: args.imageTagMutability ?? "IMMUTABLE",
        imageScanningConfiguration: { scanOnPush: args.scanOnPush ?? true },
        forceDelete: args.forceDelete ?? false,
        tags: this.tags,
      },
      { parent: this },
    );
    this.repositoryArn = this.repository.arn;
    this.repositoryUrl = this.repository.repositoryUrl;
    this.registerOutputs({ repositoryArn: this.repositoryArn, repositoryUrl: this.repositoryUrl });
  }

  imageUri(tag: pulumi.Input<string> = "latest"): pulumi.Output<string> {
    return pulumi.all([this.repositoryUrl, tag]).apply(([url, imageTag]) => `${url}:${imageTag}`);
  }
}
