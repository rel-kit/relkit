/**
 * Validates data-only server and development bridge configuration before generation.
 * Optional protocols and documentation UI are selected explicitly; invalid values
 * accumulate diagnostics without loading SDKs or acquiring listeners/tools.
 */
import {
  CONFIG_CODES,
  ConfigPort,
  ConfigPositive,
  DEFAULT_TOOLING_CONFIG,
  type ConfigIssue,
} from "./config-loader-types.js";
import { Result, Schema } from "effect";
import { normalizeInspectorConfiguration } from "@relkit/contracts";
import { readRecord } from "./config-loader-utils.js";
import { readBoolean, rejectUnknown } from "./config-loader-fields.js";

/**
 * Validates inspector settings and applies tooling defaults.
 * @typeParam Value - Untrusted metadata retained until shared schema decoding.
 * @param value - Declared metadata inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Normalized inspector settings after issues are collected.
 */
export function readInspector<Value>(value: Value, issues: ConfigIssue[]) {
  const result = normalizeInspectorConfiguration(value);
  if (Result.isSuccess(result)) return result.success;
  const legacyPort = value !== null && typeof value === "object" && "port" in value;
  issues.push({
    code: CONFIG_CODES.inspector,
    path: legacyPort ? "inspector.port" : "inspector",
    message: result.failure.message,
  });
  return DEFAULT_TOOLING_CONFIG.inspector;
}

/**
 * Validates server settings and applies tooling defaults.
 * @typeParam Value - Configured server metadata decoded before field access.
 * @param value - Declared metadata inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Normalized server settings after issues are collected.
 */
export function readServer<Value>(value: Value, issues: ConfigIssue[]) {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.server;
  const record = readRecord(value, "server", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.server;
  rejectUnknown(
    record,
    "server",
    ["port", "maxBodyBytes", "apiDocs", "clientContract", "mcp", "agUi"],
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
  const mcp = readBoolean(record.mcp, "server.mcp", false, issues);
  const agUi = readBoolean(record.agUi, "server.agUi", false, issues);
  return { port, maxBodyBytes, apiDocs, clientContract, mcp, agUi };
}

/**
 * Validates API documentation exposure settings.
 * @typeParam Value - Configured documentation metadata decoded before field access.
 * @param value - Declared metadata inspected without coercion.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Normalized API documentation exposure settings.
 */
function readApiDocs<Value>(value: Value, issues: ConfigIssue[]) {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.server.apiDocs;
  const record = readRecord(value, "server.apiDocs", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.server.apiDocs;
  rejectUnknown(record, "server.apiDocs", ["enabledInProduction", "excludeDomains", "ui"], issues);
  if (record.ui !== undefined && record.ui !== false && record.ui !== "scalar")
    issues.push({
      code: CONFIG_CODES.behavior,
      path: "server.apiDocs.ui",
      message: 'server.apiDocs.ui must be "scalar" or false.',
    });
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
    ui: record.ui === "scalar" ? ("scalar" as const) : (false as const),
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
 * @typeParam Value - Configured port decoded as an integer before use.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param fallback - Value retained when metadata is absent.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns The validated TCP port, or its fallback after recording an issue.
 */
function readPort<Value>(
  value: Value,
  path: string,
  fallback: number,
  issues: ConfigIssue[],
): number {
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
 * @typeParam Value - Configured byte limit decoded before use.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param fallback - Value retained when metadata is absent.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns The positive integer limit, or its fallback after recording an issue.
 */
function readPositive<Value>(
  value: Value,
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
