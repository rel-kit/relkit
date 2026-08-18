import { normalizeSourcePath } from "@zsys/contracts";
import { CONFIG_CODES, DEFAULT_TOOLING_CONFIG, type ConfigIssue } from "./config-loader-types.js";

export function readPath(
  value: unknown,
  path: string,
  fallback: string,
  root: string,
  allowGlob: boolean,
  issues: ConfigIssue[],
): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0 || (!allowGlob && hasGlob(value))) {
    issues.push({ code: CONFIG_CODES.path, path, message: `${path} must be a valid path.` });
    return fallback;
  }
  try {
    return normalizeSourcePath(value, root);
  } catch (error) {
    const message = errorMessage(error);
    issues.push({
      code: message.includes("inside") ? CONFIG_CODES.outsideRoot : CONFIG_CODES.path,
      path,
      message: `${path}: ${message}`,
    });
    return fallback;
  }
}

export function readPaths(
  value: unknown,
  path: "source" | "exclude",
  fallback: readonly string[],
  root: string,
  issues: ConfigIssue[],
): readonly string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || (path === "source" && value.length === 0)) {
    issues.push({
      code: path === "source" ? CONFIG_CODES.source : CONFIG_CODES.exclude,
      path,
      message: `${path} must be a non-empty array of path patterns.`,
    });
    return fallback;
  }
  const normalized = value.map((entry, index) =>
    readPath(entry, `${path}[${index}]`, fallback[0] ?? "src/**/*.ts", root, true, issues),
  );
  return Object.freeze([...new Set(normalized)].sort());
}

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

export function hasGlob(value: string): boolean {
  return /[*?\[\]{}]/.test(value);
}

export const allowedKeys = new Set([
  "entry",
  "source",
  "exclude",
  "generatedDirectory",
  "inspector",
]);
