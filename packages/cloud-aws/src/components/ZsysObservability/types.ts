import type * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import type { ZsysComponentArgs, ZsysEnvironmentVariable, ZsysSecretVariable } from "../common.js";

export interface ZsysOtlpExport {
  readonly endpoint: pulumi.Input<string>;
  readonly headersSecretArn?: pulumi.Input<string>;
  readonly serviceName?: pulumi.Input<string>;
}

export interface ZsysObservabilityArgs extends ZsysComponentArgs {
  readonly logs?: boolean;
  readonly traces?: boolean;
  readonly retentionDays?: pulumi.Input<number>;
  readonly otlp?: ZsysOtlpExport;
}

export interface ZsysObservabilityMappings {
  readonly environment: readonly ZsysEnvironmentVariable[];
  readonly secrets: readonly ZsysSecretVariable[];
}

export interface ZsysObservabilityResources extends ZsysObservabilityMappings {
  readonly logGroup: aws.cloudwatch.LogGroup | undefined;
  readonly logGroupName: pulumi.Output<string> | undefined;
  readonly logGroupArn: pulumi.Output<string> | undefined;
  readonly tags: pulumi.Output<Record<string, string>>;
}
