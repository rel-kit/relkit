import type { LoadedDeploymentConfig } from "./config-loader-deployment.types.js";
export type { LoadedDeploymentConfig } from "./config-loader-deployment.types.js";
import { isStableId } from "@relkit/contracts";
import { CONFIG_CODES, type ConfigIssue } from "./config-loader-types.js";
import { readRecord } from "./config-loader-utils.js";

/**
 * Validates tooling deployment engine and host integration identities.
 * @param value - Declared metadata inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Validated deployment settings, or undefined when absent.
 */
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

/**
 * Validates a deployment integration identity with its configuration path.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns The stable integration identity, or undefined with a configuration issue.
 */
function integrationId(value: unknown, path: string, issues: ConfigIssue[]): string | undefined {
  if (isStableId(value)) return value;
  issues.push({
    code: CONFIG_CODES.behavior,
    path,
    message: `${path} must be a stable integration ID.`,
  });
  return undefined;
}
