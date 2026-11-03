/** Reads the optional tooling sections: the deployment engine and the opt-in `relkit check` rules. */
import { CONFIG_CODES, type ConfigIssue } from "./config-loader-types.js";
import { readDeployment, type LoadedDeploymentConfig } from "./config-loader-deployment.js";
import { readBoolean } from "./config-loader-fields.js";
import { readRecord } from "./config-loader-utils.js";

/** Opt-in check rules after defaults are applied. */
export interface LoadedCheckConfig {
  readonly unusedErrors: boolean;
}

/**
 * Validates the `check` settings; every rule is off unless enabled.
 * @param value - Declared settings inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns The rules with defaults applied.
 */
export function readCheck(value: unknown, issues: ConfigIssue[]): LoadedCheckConfig {
  if (value === undefined) return Object.freeze({ unusedErrors: false });
  const record = readRecord(value, "check", issues);
  if (record === undefined) return Object.freeze({ unusedErrors: false });
  for (const key of Object.keys(record))
    if (key !== "unusedErrors")
      issues.push({
        code: CONFIG_CODES.key,
        path: `check.${key}`,
        message: `Unknown check setting "${key}".`,
      });
  return Object.freeze({
    unusedErrors: readBoolean(record.unusedErrors, "check.unusedErrors", false, issues),
  });
}

/**
 * Validates the optional sections and returns only those that are set.
 * @param record - Validated tooling configuration object.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns `deployment` when configured and `check` when a rule is enabled.
 */
export function readOptionalSections(
  record: Readonly<Record<string, unknown>>,
  issues: ConfigIssue[],
): { readonly deployment?: LoadedDeploymentConfig; readonly check?: LoadedCheckConfig } {
  const deployment = readDeployment(record.deployment, issues);
  const check = readCheck(record.check, issues);
  return {
    ...(deployment === undefined ? {} : { deployment }),
    ...(check.unusedErrors ? { check } : {}),
  };
}
