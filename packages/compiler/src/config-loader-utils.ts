import { CONFIG_CODES, type ConfigIssue } from "./config-loader-types.js";

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
    return (
      (typeof key === "string" || key === Symbol.for("zsys.descriptor")) &&
      descriptor !== undefined &&
      "value" in descriptor
    );
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

export const allowedKeys = new Set([
  "kind",
  "id",
  "ref",
  "title",
  "description",
  "tags",
  "env",
  "buckets",
  "caches",
  "jobs",
  "events",
  "models",
  "observability",
  "defaults",
  "sentry",
  "telemetry",
  "server",
  "inspector",
  "deployment",
]);
