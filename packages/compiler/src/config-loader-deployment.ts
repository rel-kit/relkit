import { CONFIG_CODES, type ConfigIssue } from "./config-loader-types.js";
import { readRecord } from "./config-loader-utils.js";

export interface LoadedDeploymentConfig {
  readonly target: "aws";
  readonly adapter: "pulumi";
}

export function readDeployment(
  value: unknown,
  issues: ConfigIssue[],
): LoadedDeploymentConfig | undefined {
  if (value === undefined) return undefined;
  const record = readRecord(value, "deployment", issues);
  if (record === undefined) return undefined;
  for (const key of Object.keys(record)) {
    if (key !== "target" && key !== "adapter") {
      issues.push({
        code: CONFIG_CODES.key,
        path: `deployment.${key}`,
        message: `Unknown deployment setting "${key}".`,
      });
    }
  }
  if (record.target !== "aws") {
    issues.push({
      code: CONFIG_CODES.behavior,
      path: "deployment.target",
      message: 'deployment.target must be "aws".',
    });
  }
  if (record.adapter !== "pulumi") {
    issues.push({
      code: CONFIG_CODES.behavior,
      path: "deployment.adapter",
      message: 'deployment.adapter must be "pulumi".',
    });
  }
  return record.target === "aws" && record.adapter === "pulumi"
    ? Object.freeze({ target: "aws", adapter: "pulumi" })
    : undefined;
}
