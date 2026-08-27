import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type {
  RelkitComponentArgs,
  RelkitEnvironmentVariable,
  RelkitSecretVariable,
} from "../common.js";

export interface RelkitOtlpExport {
  readonly endpoint: pulumi.Input<string>;
  readonly headersSecretArn?: pulumi.Input<string>;
  readonly serviceName?: pulumi.Input<string>;
}

export interface RelkitObservabilityArgs extends RelkitComponentArgs {
  readonly logs?: boolean;
  readonly traces?: boolean;
  readonly retentionDays?: pulumi.Input<number>;
  readonly otlp?: RelkitOtlpExport;
}

export interface RelkitObservabilityMappings {
  readonly environment: readonly RelkitEnvironmentVariable[];
  readonly secrets: readonly RelkitSecretVariable[];
}

export interface RelkitObservabilityResources extends RelkitObservabilityMappings {
  readonly logGroup: aws.cloudwatch.LogGroup | undefined;
  readonly logGroupName: pulumi.Output<string> | undefined;
  readonly logGroupArn: pulumi.Output<string> | undefined;
  readonly tags: pulumi.Output<Record<string, string>>;
}
