import { CONFIG_CODES, DEFAULT_TOOLING_CONFIG, type ConfigIssue } from "./config-loader-types.js";
import { readRecord } from "./config-loader-utils.js";

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
  if (
    port !== undefined &&
    (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535)
  ) {
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

function readApiDocs(value: unknown, issues: ConfigIssue[]) {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.server.apiDocs;
  const record = readRecord(value, "server.apiDocs", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.server.apiDocs;
  rejectUnknown(record, "server.apiDocs", ["enabledInProduction"], issues);
  if (record.enabledInProduction !== undefined && typeof record.enabledInProduction !== "boolean") {
    issues.push({
      code: CONFIG_CODES.behavior,
      path: "server.apiDocs.enabledInProduction",
      message: "server.apiDocs.enabledInProduction must be a boolean.",
    });
  }
  return {
    enabledInProduction:
      typeof record.enabledInProduction === "boolean" ? record.enabledInProduction : false,
  };
}

function readPort(value: unknown, path: string, fallback: number, issues: ConfigIssue[]): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 65_535) {
    issues.push({
      code: CONFIG_CODES.port,
      path,
      message: `${path} must be from 1 through 65535.`,
    });
    return fallback;
  }
  return Number(value);
}

function readPositive(
  value: unknown,
  path: string,
  fallback: number,
  issues: ConfigIssue[],
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    issues.push({ code: CONFIG_CODES.behavior, path, message: `${path} must be positive.` });
    return fallback;
  }
  return Number(value);
}

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
