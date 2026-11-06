/**
 * Shares primitive configuration checks between server and nested documentation
 * readers. Callers retain the original untrusted values and ordered issue list;
 * these checks neither coerce data nor acquire runtime capabilities.
 */
import { CONFIG_CODES, type ConfigIssue } from "./config-loader-types.js";

/** Checks a boolean field without changing its existing fallback policy.
 * @param value - Untrusted configured value at the parsing boundary.
 * @param path - Exact diagnostic property path.
 * @param fallback - Default used when absent or invalid.
 * @param issues - Caller-owned issue list.
 * @returns Valid boolean or its declared default.
 */
export function readBoolean(
  value: unknown,
  path: string,
  fallback: boolean,
  issues: ConfigIssue[],
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    issues.push({ code: CONFIG_CODES.behavior, path, message: `${path} must be a boolean.` });
    return fallback;
  }
  return value;
}

/** Records unsupported keys while retaining the original diagnostic ordering.
 * @param record - Validated configuration object.
 * @param path - Parent configuration diagnostic path.
 * @param allowed - Supported keys for this specific object.
 * @param issues - Caller-owned issue list.
 * @returns Nothing; appends one issue for each unsupported key.
 */
export function rejectUnknown(
  record: Readonly<Record<string, unknown>>,
  path: string,
  allowed: readonly string[],
  issues: ConfigIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      issues.push({
        code: CONFIG_CODES.key,
        path: `${path}.${key}`,
        message: `Unknown ${path} setting "${key}".`,
      });
    }
  }
}
