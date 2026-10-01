import {
  CONFIG_CODES,
  ConfigPort,
  ConfigPositive,
  DEFAULT_TOOLING_CONFIG,
  type ConfigIssue,
} from "./config-loader-types.js";
import { Schema } from "effect";
import { readRecord } from "./config-loader-utils.js";

/**
 * Validates inspector settings and applies tooling defaults.
 * @param value - Declared metadata inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Normalized inspector settings after issues are collected.
 */
export function readInspector(value: unknown, issues: ConfigIssue[]) {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.inspector;
  const record = readRecord(value, "inspector", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.inspector;
  for (const key of Object.keys(record)) {
    if (!["port", "enabledInProduction", "maxPreviewBytes"].includes(key)) {
      issues.push({
        code: CONFIG_CODES.inspector,
        path: `inspector.${key}`,
        message: `Unknown inspector setting "${key}".`,
      });
    }
  }
  const port = record.port;
  if (port !== undefined && !Schema.is(ConfigPort)(port)) {
    issues.push({
      code: CONFIG_CODES.port,
      path: "inspector.port",
      message: "inspector.port must be an integer from 1 through 65535.",
    });
  }
  const enabledInProduction = readBoolean(
    record.enabledInProduction,
    "inspector.enabledInProduction",
    false,
    issues,
  );
  const maxPreviewBytes = readPositive(
    record.maxPreviewBytes,
    "inspector.maxPreviewBytes",
    DEFAULT_TOOLING_CONFIG.inspector.maxPreviewBytes,
    issues,
  );
  return { port: typeof port === "number" ? port : 3210, enabledInProduction, maxPreviewBytes };
}

/**
 * Validates server settings and applies tooling defaults.
 * @param value - Declared metadata inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Normalized server settings after issues are collected.
 */
export function readServer(value: unknown, issues: ConfigIssue[]) {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.server;
  const record = readRecord(value, "server", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.server;
  rejectUnknown(
    record,
    "server",
    ["port", "maxBodyBytes", "apiDocs", "clientContract", "mcp"],
    issues,
  );
  const port = readPort(record.port, "server.port", DEFAULT_TOOLING_CONFIG.server.port, issues);
  const maxBodyBytes = readPositive(
    record.maxBodyBytes,
    "server.maxBodyBytes",
    DEFAULT_TOOLING_CONFIG.server.maxBodyBytes,
    issues,
  );
  const apiDocs = readApiDocs(record.apiDocs, issues);
  const clientContract = readBoolean(record.clientContract, "server.clientContract", true, issues);
  const mcp = readBoolean(record.mcp, "server.mcp", true, issues);
  return { port, maxBodyBytes, apiDocs, clientContract, mcp };
}

/**
 * Checks a boolean option while retaining its fallback and diagnostic path.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param fallback - Value retained when metadata is absent.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns The validated boolean or its default, with invalid settings recorded as issues.
 */
function readBoolean(
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

/**
 * Validates API documentation exposure settings.
 * @param value - Declared metadata inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Normalized API documentation exposure settings.
 */
function readApiDocs(value: unknown, issues: ConfigIssue[]) {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.server.apiDocs;
  const record = readRecord(value, "server.apiDocs", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.server.apiDocs;
  rejectUnknown(record, "server.apiDocs", ["enabledInProduction", "excludeDomains"], issues);
  if (record.enabledInProduction !== undefined && typeof record.enabledInProduction !== "boolean") {
    issues.push({
      code: CONFIG_CODES.behavior,
      path: "server.apiDocs.enabledInProduction",
      message: "server.apiDocs.enabledInProduction must be a boolean.",
    });
  }
  const excludeDomains = record.excludeDomains;
  const validDomains =
    Array.isArray(excludeDomains) &&
    excludeDomains.every(
      (domain): domain is string => typeof domain === "string" && domain.trim().length > 0,
    );
  if (excludeDomains !== undefined && !validDomains) {
    issues.push({
      code: CONFIG_CODES.behavior,
      path: "server.apiDocs.excludeDomains",
      message: "server.apiDocs.excludeDomains must be an array of non-empty domain IDs.",
    });
  }
  return {
    enabledInProduction:
      typeof record.enabledInProduction === "boolean" ? record.enabledInProduction : false,
    ...(validDomains
      ? {
          excludeDomains: Object.freeze([
            ...new Set(excludeDomains.map((domain) => domain.trim())),
          ]),
        }
      : {}),
  };
}

/**
 * Checks a valid TCP port and retains the configured fallback.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param fallback - Value retained when metadata is absent.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns The validated TCP port, or its fallback after recording an issue.
 */
function readPort(value: unknown, path: string, fallback: number, issues: ConfigIssue[]): number {
  if (value === undefined) return fallback;
  if (!Schema.is(ConfigPort)(value)) {
    issues.push({
      code: CONFIG_CODES.port,
      path,
      message: `${path} must be from 1 through 65535.`,
    });
    return fallback;
  }
  return Number(value);
}

/**
 * Checks a positive integer tooling limit and retains its fallback.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param fallback - Value retained when metadata is absent.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns The positive integer limit, or its fallback after recording an issue.
 */
function readPositive(
  value: unknown,
  path: string,
  fallback: number,
  issues: ConfigIssue[],
): number {
  if (value === undefined) return fallback;
  if (!Schema.is(ConfigPositive)(value) || !Number.isSafeInteger(value)) {
    issues.push({ code: CONFIG_CODES.behavior, path, message: `${path} must be positive.` });
    return fallback;
  }
  return Number(value);
}

/**
 * Records unsupported nested configuration keys.
 * @param record - Validated configuration record whose keys are inspected.
 * @param path - Portable source, property, or runtime path.
 * @param allowed - Supported nested configuration keys.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function rejectUnknown(
  record: Record<string, unknown>,
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
