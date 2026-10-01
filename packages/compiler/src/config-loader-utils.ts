import { CONFIG_CODES, type ConfigIssue } from "./config-loader-types.js";

/**
 * Checks a plain tooling configuration object and records shape issues.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns A plain configuration object, or undefined with shape issues appended.
 */
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
      (typeof key === "string" || key === Symbol.for("relkit.descriptor")) &&
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

/**
 * Unwraps a tooling module's default export when present.
 * @param value - Declared metadata inspected without coercion.
 * @returns The default export when present, otherwise the original value.
 */
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

/**
 * Preserves an exception's message without losing non-Error rejection text.
 * @param error - Original exception or rejection value.
 * @returns The Error message or string form of the original rejection.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "value is invalid";
}

/**
 * Freezes copied configuration issues before publication.
 * @param issues - Caller-owned ordered configuration issues.
 * @returns Copied, frozen configuration issues in their original order.
 */
export function freezeIssues(issues: readonly ConfigIssue[]): readonly ConfigIssue[] {
  return Object.freeze(
    [...issues]
      .map((issue) => Object.freeze({ ...issue }))
      .sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
  );
}

/**
 * Checks whether a configuration value is an ordinary object.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for an ordinary or null-prototype nonarray object.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Recognizes supported absolute native path spellings.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a supported absolute POSIX, Windows, or UNC path.
 */
export function isAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

/**
 * Normalizes portable path separators and dot segments.
 * @param value - Declared metadata inspected without coercion.
 * @returns A portable path with normalized separators and dot segments.
 */
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
  "bucket",
  "cache",
  "jobs",
  "job",
  "event",
  "model",
  "realtime",
  "agent-state",
  "defaults",
  "telemetry",
  "server",
  "inspector",
  "deployment",
  "compatibility",
]);
