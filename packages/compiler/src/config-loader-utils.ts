import { CONFIG_CODES, DEFAULT_TOOLING_CONFIG, type ConfigIssue } from "./config-loader-types.js";

export function readInspector(value: unknown, issues: ConfigIssue[]): { readonly port: number } {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.inspector;
  const record = readRecord(value, "inspector", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.inspector;
  for (const key of Object.keys(record)) {
    if (key !== "port") {
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
  return { port: typeof port === "number" ? port : 3210 };
}

export function readServer(
  value: unknown,
  issues: ConfigIssue[],
): {
  readonly port: number;
  readonly maxBodyBytes: number;
  readonly apiDocs: { readonly enabledInProduction: boolean };
} {
  if (value === undefined) return DEFAULT_TOOLING_CONFIG.server;
  const record = readRecord(value, "server", issues);
  if (record === undefined) return DEFAULT_TOOLING_CONFIG.server;
  rejectUnknown(record, "server", ["port", "maxBodyBytes", "apiDocs"], issues);
  const port = readPort(record.port, "server.port", DEFAULT_TOOLING_CONFIG.server.port, issues);
  const maxBodyBytes = readPositive(
    record.maxBodyBytes,
    "server.maxBodyBytes",
    DEFAULT_TOOLING_CONFIG.server.maxBodyBytes,
    issues,
  );
  const apiDocs = readApiDocs(record.apiDocs, issues);
  return { port, maxBodyBytes, apiDocs };
}

function readApiDocs(
  value: unknown,
  issues: ConfigIssue[],
): { readonly enabledInProduction: boolean } {
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

export function readRecord(
  value: unknown,
  path: string,
  issues: ConfigIssue[],
): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) {
    issues.push({
      code: path === "$" ? CONFIG_CODES.root : CONFIG_CODES.behavior,
      path,
      message:
        path === "$"
          ? "Tooling config must be a plain object."
          : `${path} cannot contain application behavior.`,
    });
    return undefined;
  }
  const safe = Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === "string" && descriptor !== undefined && "value" in descriptor;
  });
  if (!safe) {
    issues.push({
      code: CONFIG_CODES.behavior,
      path,
      message: "Tooling config cannot contain accessors, symbols, or executable behavior.",
    });
  }
  return safe ? value : undefined;
}

export function unwrapDefault(value: unknown): unknown {
  if (
    !isPlainRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, "default")
  ) {
    return value;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "default");
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : value;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "value is invalid";
}

export function freezeIssues(issues: readonly ConfigIssue[]): readonly ConfigIssue[] {
  return Object.freeze(
    [...issues]
      .map((issue) => Object.freeze({ ...issue }))
      .sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
  );
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

export function posixNormalize(value: string): string {
  const segments: string[] = [];
  for (const segment of value.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  const prefix = value.startsWith("/") ? "/" : "";
  return `${prefix}${segments.join("/")}` || prefix || ".";
}

export const allowedKeys = new Set(["server", "inspector"]);
