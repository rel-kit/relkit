import { Effect } from "effect";
import type {
  ConventionCheckInput,
  ConventionCheckOptions,
  KindRule,
} from "./conventions.types.js";
import {
  isDescriptor,
  isDescriptorKind,
  normalizeSourcePathEffect,
  type DescriptorAny,
  type DescriptorKind,
  type SourceLocation,
} from "@relkit/contracts";

/**
 * Selects source naming rules for a descriptor's domain and kind.
 * @param rule - Selected source naming convention.
 * @param kind - Descriptor or syntax category.
 * @param path - Portable source, property, or runtime path.
 * @returns The kind's naming rule with its source domain inserted.
 */
export function ruleFor(rule: KindRule, kind: DescriptorKind, path: string): KindRule {
  if (kind === "app" || kind === "route" || kind === "middleware") return rule;
  const domain = path.split("/")[1] ?? "<domain>";
  return kind === "service"
    ? { ...rule, directory: `src/${domain}` }
    : { ...rule, directory: `src/${domain}/${rule.directory}` };
}

/**
 * Selects structured or positional source convention input.
 * @param value - Declared metadata inspected without coercion.
 * @param sourcePath - Authored source filename.
 * @param options - Caller-supplied configuration for this operation.
 * @returns Structured convention input, or undefined for an unsupported call shape.
 */
export function readInput(
  value: ConventionCheckInput | unknown,
  sourcePath: string | undefined,
  options: ConventionCheckOptions,
): ConventionCheckInput | undefined {
  if (sourcePath !== undefined) {
    return { ...options, descriptor: value, sourcePath };
  }
  if (!isRecord(value) || typeof value.descriptor === "undefined") return undefined;
  return value as unknown as ConventionCheckInput;
}

/**
 * Normalizes a source path while retaining the permitted lexical fallback.
 * @param value - Declared metadata inspected without coercion.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns A lazy effect yielding a portable path, using lexical fallback only for SourceLocationError.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const normalizePathEffect = Effect.fn("Compiler.conventionPath")(function* (
  value: string,
  projectRoot: string | undefined,
) {
  return yield* normalizeSourcePathEffect(value, projectRoot).pipe(
    Effect.catchTag("SourceLocationError", () =>
      Effect.succeed(value.replaceAll("\\", "/").replace(/^\.\//, "")),
    ),
  );
});

/**
 * Builds a one-based diagnostic location for portable relative paths.
 * @param path - Portable source, property, or runtime path.
 * @param input - Compiler input and source provenance.
 * @returns A relative one-based location, or undefined for empty or absolute paths.
 */
export function diagnosticLocation(
  path: string,
  input: ConventionCheckInput,
): SourceLocation | undefined {
  if (path === "" || /^(?:\/|[A-Za-z]:\/|\/\/)/.test(path)) return undefined;
  return {
    file: path,
    line: input.location?.line ?? 1,
    column: input.location?.column ?? 1,
  };
}

/**
 * Renders the recommended source filename pattern.
 * @param rule - Selected source naming convention.
 * @returns The recommended glob-like filename pattern for this descriptor kind.
 */
export function recommendedPattern(rule: KindRule): string {
  return rule.directory === "." ? rule.suffix : `${rule.directory}/**/*${rule.suffix}`;
}

/**
 * Checks whether a descriptor lacks the recommended export form.
 * @param input - Compiler input and source provenance.
 * @returns True when the descriptor lacks its recommended default export.
 */
export function hasExportWarning(input: ConventionCheckInput): boolean {
  if (isDescriptor(input.descriptor) && input.descriptor.kind === "task") return false;
  if (input.exports !== undefined) {
    return !input.exports.some(
      (entry) => entry.isDefault ?? entry.defaultExport ?? entry.name === "default",
    );
  }
  if (input.isDefaultExport !== undefined) return !input.isDefaultExport;
  if (input.defaultExport !== undefined) return !input.defaultExport;
  if (input.exportKind !== undefined) return input.exportKind !== "default";
  if (input.exportName !== undefined) return input.exportName !== "default";
  return false;
}

/**
 * Collects distinct runtime descriptor kinds declared by one source file.
 * @param input - Compiler input and source provenance.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @returns Distinct descriptor kinds sorted by name.
 */
export function descriptorKinds(
  input: ConventionCheckInput,
  descriptor: DescriptorAny,
): DescriptorKind[] {
  const kinds = new Set<DescriptorKind>([descriptor.kind]);
  for (const kind of input.fileKinds ?? []) {
    if (isDescriptorKind(kind)) kinds.add(kind);
  }
  for (const candidate of input.fileDescriptors ?? []) {
    if (isDescriptor(candidate)) kinds.add(candidate.kind);
  }
  return [...kinds].sort();
}

/**
 * Recognizes nonnull nonarray objects for metadata inspection.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnull, nonarray metadata object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
