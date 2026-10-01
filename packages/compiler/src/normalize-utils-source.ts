import { SourceLocationError } from "@relkit/contracts";
import { isRecord } from "./normalize-utils-values.js";
import {
  normalizeSourceLocation,
  normalizeSourcePath,
  type SourceLocation,
} from "@relkit/contracts";
import type { NormalizeInput, NormalizedDescriptor } from "./normalize-types.js";

/**
 * Resolves descriptor source provenance with a deterministic fallback.
 * @param value - Declared metadata inspected without coercion.
 * @param input - Compiler input and source provenance.
 * @param fallback - Value retained when metadata is absent.
 * @returns The descriptor source location, with deterministic fallback coordinates.
 */
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
    } catch (error) {
      if (!(error instanceof SourceLocationError)) throw error;
      // The caller emits the stable source diagnostic and uses the fallback.
    }
  }
  return { file: normalizeSourcePath(fallback, root), line: 1, column: 1 };
}

/**
 * Checks one-based portable source location coordinates.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the record has a filename and positive one-based coordinates.
 */
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

/**
 * Selects authoritative source mapping evidence for a descriptor.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param input - Compiler input and source provenance.
 * @returns Authoritative mapped source evidence or the descriptor fallback.
 */
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
      } catch (error) {
        if (!(error instanceof SourceLocationError)) throw error;
        return descriptor.source;
      }
    }
  }
  return descriptor.source;
}
