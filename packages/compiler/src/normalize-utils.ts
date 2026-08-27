import {
  canonicalJson,
  isStableId,
  normalizeId,
  normalizeSourceLocation,
  normalizeSourcePath,
  type JsonValue,
  type SourceLocation,
} from "@relkit/contracts";
import type { NormalizeInput, NormalizedDescriptor } from "./normalize-types.js";

export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

export function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function nonNegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function stable(value: unknown): value is string {
  return isStableId(value);
}

export function id(value: unknown): string | undefined {
  try {
    return normalizeId(value);
  } catch {
    return undefined;
  }
}

export function method(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim().toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"].includes(result)
    ? result
    : undefined;
}

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

export function profile(value: unknown): string | undefined {
  return value === undefined ? "default" : id(value);
}

export function source(
  value: unknown,
  input: NormalizeInput,
  fallback = "relkit.config.ts",
): SourceLocation {
  const root = input.projectRoot;
  const location = isSourceLocation(value) ? value : isRecord(value) ? value.source : undefined;
  if (isSourceLocation(location)) {
    try {
      return normalizeSourceLocation(location, root);
    } catch {
      // The caller emits the stable source diagnostic and uses the fallback.
    }
  }
  return { file: normalizeSourcePath(fallback, root), line: 1, column: 1 };
}

export function isSourceLocation(value: unknown): value is SourceLocation {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    Number.isInteger(value.line) &&
    Number.isInteger(value.column) &&
    value.line > 0 &&
    value.column > 0
  );
}

export function locationFor(
  descriptor: NormalizedDescriptor,
  input: NormalizeInput,
): SourceLocation {
  const configured = input.locations;
  const keys = [
    descriptor.id,
    descriptor.source.file,
    `${descriptor.source.file}:${descriptor.id}`,
  ];
  for (const key of keys) {
    const getter = configured === undefined ? undefined : (configured as { get?: unknown }).get;
    const value =
      typeof getter === "function"
        ? (getter as (name: string) => SourceLocation | undefined)(key)
        : (configured as Readonly<Record<string, SourceLocation>> | undefined)?.[key];
    if (isSourceLocation(value)) {
      try {
        return normalizeSourceLocation(value, input.projectRoot);
      } catch {
        return descriptor.source;
      }
    }
  }
  return descriptor.source;
}

export function json(value: unknown): value is JsonValue {
  try {
    canonicalJson(value);
    return true;
  } catch {
    return false;
  }
}

export function canonical(value: unknown): string {
  return canonicalJson(value);
}

export function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJson(child)]));
  }
  return value;
}

export function refId(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.ref) ? id(value.ref.id) : undefined;
}

export function refKind(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.ref) && typeof value.ref.kind === "string"
    ? value.ref.kind
    : undefined;
}

export function schemaKey(descriptorId: string, field: string): string {
  return `${descriptorId}:${field}`;
}

export function stableKey(value: string, source: SourceLocation): string {
  return `${value}\0${source.file}\0${source.line}\0${source.column}`;
}
