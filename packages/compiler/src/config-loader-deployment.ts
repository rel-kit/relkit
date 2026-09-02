import { isStableId } from "@relkit/contracts";
import { CONFIG_CODES, type ConfigIssue } from "./config-loader-types.js";
import { readRecord } from "./config-loader-utils.js";

export interface LoadedDeploymentConfig {
  readonly engine: string;
  readonly host: string;
}

export function readDeployment(
  value: unknown,
  issues: ConfigIssue[],
): LoadedDeploymentConfig | undefined {
  if (value === undefined) return undefined;
  const record = readRecord(value, "deployment", issues);
  if (record === undefined) return undefined;
  for (const key of Object.keys(record)) {
    if (key !== "engine" && key !== "host") {
      issues.push({
        code: CONFIG_CODES.key,
        path: `deployment.${key}`,
        message: `Unknown deployment setting "${key}".`,
      });
    }
  }
  const engine = integrationId(record.engine, "deployment.engine", issues);
  const host = integrationId(record.host, "deployment.host", issues);
  return engine === undefined || host === undefined ? undefined : Object.freeze({ engine, host });
}

function integrationId(value: unknown, path: string, issues: ConfigIssue[]): string | undefined {
  if (isStableId(value)) return value;
  issues.push({
    code: CONFIG_CODES.behavior,
    path,
    message: `${path} must be a stable integration ID.`,
  });
  return undefined;
}
