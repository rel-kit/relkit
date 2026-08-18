import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
  awsRegion,
  environmentEntries,
  resourceName,
  secretEntries,
  tagsFor,
  validateMappings,
} from "../common.js";
import type { ZsysObservabilityArgs, ZsysObservabilityResources } from "./types.js";

export * from "./types.js";

/** Maps runtime logs to CloudWatch and optional traces to OTLP injection. */
export class ZsysObservability
  extends pulumi.ComponentResource
  implements ZsysObservabilityResources
{
  readonly logGroup: aws.cloudwatch.LogGroup | undefined;
  readonly logGroupName: pulumi.Output<string> | undefined;
  readonly logGroupArn: pulumi.Output<string> | undefined;
  readonly environment: ZsysObservabilityResources["environment"];
  readonly secrets: ZsysObservabilityResources["secrets"];
  readonly tags: pulumi.Output<Record<string, string>>;

  constructor(
    name: string,
    args: ZsysObservabilityArgs = {},
    opts: pulumi.ComponentResourceOptions = {},
  ) {
    const componentName = resourceName(name, "observability", args, 64);
    super("zsys:cloud-aws:ZsysObservability", componentName, {}, opts);
    this.tags = tagsFor(name, args);
    const region = awsRegion(args);
    if (
      args.retentionDays !== undefined &&
      typeof args.retentionDays === "number" &&
      (!Number.isSafeInteger(args.retentionDays) || args.retentionDays < 1)
    )
      throw new RangeError("CloudWatch retentionDays must be a positive integer.");
    if (
      args.otlp !== undefined &&
      typeof args.otlp.endpoint === "string" &&
      args.otlp.endpoint.trim() === ""
    )
      throw new TypeError("OTLP endpoint must not be empty.");
    this.logGroup =
      args.logs === false
        ? undefined
        : new aws.cloudwatch.LogGroup(
            `${componentName}-logs`,
            {
              name: `/zsys/${componentName}`,
              retentionInDays: args.retentionDays ?? 30,
              region,
              tags: this.tags,
            },
            { parent: this },
          );
    this.logGroupName = this.logGroup?.name;
    this.logGroupArn = this.logGroup?.arn;
    const environment = [
      { name: "AWS_REGION", value: region },
      ...(args.otlp === undefined
        ? []
        : [
            { name: "OTEL_EXPORTER_OTLP_ENDPOINT", value: args.otlp.endpoint },
            ...(args.otlp.serviceName === undefined
              ? []
              : [{ name: "OTEL_SERVICE_NAME", value: args.otlp.serviceName }]),
          ]),
    ];
    const secrets =
      args.otlp?.headersSecretArn === undefined
        ? []
        : [{ name: "OTEL_EXPORTER_OTLP_HEADERS", valueFrom: args.otlp.headersSecretArn }];
    validateMappings(environmentEntries(environment), secretEntries(secrets));
    this.environment = environmentEntries(environment);
    this.secrets = secretEntries(secrets);
    this.registerOutputs({
      logGroupName: this.logGroupName,
      logGroupArn: this.logGroupArn,
      region,
      traces: args.traces ?? args.otlp !== undefined,
    });
  }
}
