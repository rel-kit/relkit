import { StableIdError } from "@relkit/contracts";
import { isStableId, normalizeId, type DescriptorKind } from "@relkit/contracts";

/**
 * Recognizes nonnull nonarray objects for metadata inspection.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnull, nonarray metadata object.
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recognizes supported descriptor kind spellings.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a supported compiler descriptor kind.
 */
export function isDescriptorKindValue(value: string): value is DescriptorKind {
  return [
    "app",
    "function",
    "middleware",
    "service",
    "route",
    "task",
    "job",
    "event",
    "event-trigger",
    "bucket",
    "cache",
    "tool",
    "agent",
    "channel",
    "constants",
    "prompt",
  ].includes(value as DescriptorKind);
}

/**
 * Recognizes live or snapshotted error descriptor identity.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when error identity and reference metadata agree.
 */
export function isErrorDescriptorLike(value: unknown): value is Record<string, any> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === "error" &&
    typeof candidate.id === "string" &&
    isRecord(candidate.ref) &&
    candidate.ref.kind === "error" &&
    candidate.ref.id === candidate.id
  );
}

/**
 * Tests own-property presence without inherited prototype lookup.
 * @param value - Declared metadata inspected without coercion.
 * @param key - Property or stable lookup key.
 * @returns True when the property belongs directly to the supplied object.
 */
export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Retains a nonempty textual metadata value without coercion.
 * @param value - Declared metadata inspected without coercion.
 * @returns The nonempty string, or undefined without coercion.
 */
export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Checks positive integer metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a positive safe integer.
 */
export function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

/**
 * Checks nonnegative integer metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnegative safe integer.
 */
export function nonNegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Checks whether a value has a valid stable identity spelling.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a valid stable identifier.
 */
export function stable(value: unknown): value is string {
  return isStableId(value);
}

/**
 * Normalizes stable descriptor identity metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns The stable descriptor ID, or undefined for an invalid value.
 */
export function id(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch (error) {
    if (!(error instanceof StableIdError)) throw error;
    return undefined;
  }
}

/**
 * Normalizes a supported HTTP method spelling.
 * @param value - Declared metadata inspected without coercion.
 * @returns The supported uppercase HTTP method, or undefined.
 */
export function method(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"].includes(result)
    ? result
    : undefined;
}

/**
 * Normalizes an absolute HTTP route path.
 * @param value - Declared metadata inspected without coercion.
 * @returns The canonical absolute route path, or undefined.
 */
export function path(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().replaceAll("\\", "/");
  if (
    !raw.startsWith("/") ||
    raw.includes("#") ||
    raw.split("/").some((part) => part.includes("?") && !/^\*[A-Za-z_][A-Za-z0-9_]*\?$/.test(part))
  )
    return undefined;
  const parts = raw.split("/").filter((part, index) => part !== "" || index === 0);
  const result = `/${parts.slice(1).join("/")}`.replace(/\/+/g, "/");
  return result === "/" ? result : result.replace(/\/$/, "");
}

/**
 * Normalizes a provider profile identity.
 * @param value - Declared metadata inspected without coercion.
 * @returns The normalized stable provider profile, or undefined.
 */
export function profile(value: unknown): string | undefined {
  return value === undefined ? "default" : id(value);
}

/**
 * Reads a descriptor or reference identity without coercion.
 * @param value - Declared metadata inspected without coercion.
 * @returns The reference ID, or undefined for unrecognized metadata.
 */
export function refId(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.ref) ? id(value.ref.id) : undefined;
}

/**
 * Reads a descriptor or reference kind without coercion.
 * @param value - Declared metadata inspected without coercion.
 * @returns The reference kind, or undefined for unrecognized metadata.
 */
export function refKind(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.ref) && typeof value.ref.kind === "string"
    ? value.ref.kind
    : undefined;
}
