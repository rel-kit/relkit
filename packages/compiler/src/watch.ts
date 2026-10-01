import { SourceLocationError } from "@relkit/contracts";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { WatchDependencyIndex, WatchInvalidation } from "./watch.types.js";
export type {
  WatchArtifactKind,
  WatchDescriptorDependency,
  WatchDependencyIndex,
  WatchInvalidation,
} from "./watch.types.js";
import { normalizeSourcePath } from "@relkit/contracts";
import type { NormalizedDescriptor } from "./normalize-types.js";

export const WATCH_ARTIFACTS = Object.freeze([
  "application.graph.json",
  "runtime.manifest.ts",
  "jobs.manifest.json",
  "runtime-activation.json",
  "runtime-integrations.plan.json",
  "runtime-integrations.ts",
  "local-services.plan.json",
  "diagnostics.json",
] as const);

/**
 * Indexes source ownership and reverse descriptor dependencies for watch invalidation.
 * @param descriptors - Ordered normalized descriptors.
 * @returns A lazy effect that indexes source ownership and reverse descriptor dependencies for watch invalidation; unexpected access failures remain defects.
 */
export const createWatchDependencyIndexEffect = Effect.fn("Compiler.createWatchDependencyIndex")(
  function* (descriptors: readonly NormalizedDescriptor[]) {
    const ordered = [...descriptors].sort(compareDescriptors);
    const sourceFiles = new Map<string, string[]>();
    const dependants = new Map<string, Set<string>>();
    const entries = ordered.map((descriptor) => {
      const dependencies = [...referencedIds(descriptor.value)]
        .filter((id) => id !== descriptor.id)
        .sort(compareText);
      const ids = sourceFiles.get(descriptor.source.file) ?? [];
      ids.push(descriptor.id);
      sourceFiles.set(descriptor.source.file, ids);
      for (const dependency of dependencies) {
        const values = dependants.get(dependency) ?? new Set<string>();
        values.add(descriptor.id);
        dependants.set(dependency, values);
      }
      return Object.freeze({ id: descriptor.id, sourceFile: descriptor.source.file, dependencies });
    });
    return Object.freeze({
      descriptors: Object.freeze(entries),
      sourceFiles: freezeMap(sourceFiles),
      dependants: freezeMap(dependants),
    });
  },
  (effect, descriptors) =>
    observeCompiler("generation", "createWatchDependencyIndex", effect, () => ({
      descriptors: descriptors.length,
    })),
);

/**
 * Indexes source ownership and reverse descriptor dependencies for watch invalidation.
 * @param descriptors - Ordered normalized descriptors.
 * @returns Source ownership and reverse dependency indexes with frozen value arrays.
 */
export function createWatchDependencyIndex(
  descriptors: readonly NormalizedDescriptor[],
): WatchDependencyIndex {
  return runCompilerSync(createWatchDependencyIndexEffect(descriptors));
}

/**
 * Computes the transitive descriptors and artifacts affected by changed source files.
 * @param index - Source ownership and reverse descriptor dependency indexes.
 * @param changedFiles - Changed authored source filenames.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns A lazy effect that computes the transitive descriptors and artifacts affected by changed source files; unexpected access failures remain defects.
 */
export const invalidateWatchDependenciesEffect = Effect.fn("Compiler.invalidateWatchDependencies")(
  function* (index: WatchDependencyIndex, changedFiles: readonly string[], projectRoot?: string) {
    const files = [...new Set(changedFiles.map((file) => watchPath(file, projectRoot)))].sort(
      compareText,
    );
    const changedIds = new Set<string>();
    for (const file of files) {
      for (const id of index.sourceFiles.get(file) ?? []) changedIds.add(id);
    }
    const affected = new Set(changedIds);
    const queue = [...changedIds].sort(compareText);
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) continue;
      for (const dependant of index.dependants.get(id) ?? []) {
        if (affected.has(dependant)) continue;
        affected.add(dependant);
        queue.push(dependant);
      }
      queue.sort(compareText);
    }
    const affectedDescriptorIds = [...affected].sort(compareText);
    const affectedFiles = index.descriptors
      .filter((descriptor) => affected.has(descriptor.id))
      .map((descriptor) => descriptor.sourceFile)
      .filter((file, position, all) => all.indexOf(file) === position)
      .sort(compareText);
    const discoveryInvalidated = files.some((file) => !index.sourceFiles.has(file));
    return Object.freeze({
      changedFiles: Object.freeze(files),
      changedDescriptorIds: Object.freeze([...changedIds].sort(compareText)),
      affectedDescriptorIds: Object.freeze(affectedDescriptorIds),
      affectedFiles: Object.freeze(affectedFiles),
      discoveryInvalidated,
      invalidatedArtifacts: Object.freeze(
        files.length === 0 || (!discoveryInvalidated && affected.size === 0)
          ? []
          : [...WATCH_ARTIFACTS],
      ),
    });
  },
  (effect, index, changedFiles, projectRoot?: string) =>
    observeCompiler("generation", "invalidateWatchDependencies", effect, () => ({
      files: changedFiles.length,
      descriptors: index.descriptors.length,
    })),
);

/**
 * Computes the transitive descriptors and artifacts affected by changed source files.
 * @param index - Source ownership and reverse descriptor dependency indexes.
 * @param changedFiles - Changed authored source filenames.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns Affected source files, descriptor IDs, and generated artifact names.
 */
export function invalidateWatchDependencies(
  index: WatchDependencyIndex,
  changedFiles: readonly string[],
  projectRoot?: string,
): WatchInvalidation {
  return runCompilerSync(invalidateWatchDependenciesEffect(index, changedFiles, projectRoot));
}

export const invalidateWatch = invalidateWatchDependencies;

/**
 * Collects nested descriptor references with cycle detection.
 * @param value - Declared metadata inspected without coercion.
 * @param result - Caller-owned collection or projection evidence.
 * @param seen - Traversal-owned identity set used to prevent recursion.
 * @returns Distinct nested reference IDs, with cyclic metadata traversed once.
 */
function referencedIds(
  value: unknown,
  result = new Set<string>(),
  seen = new WeakSet<object>(),
): Set<string> {
  if (Array.isArray(value)) {
    if (seen.has(value)) return result;
    seen.add(value);
    value.forEach((entry) => referencedIds(entry, result, seen));
    return result;
  }
  if (!isRecord(value)) return result;
  if (seen.has(value)) return result;
  seen.add(value);
  if (isRecord(value.ref) && typeof value.ref.id === "string") result.add(value.ref.id);
  Object.values(value).forEach((entry) => referencedIds(entry, result, seen));
  return result;
}

/**
 * Recognizes nonnull nonarray objects for metadata inspection.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnull, nonarray metadata object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Orders descriptors by identity and portable source position.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    compareText(left.id, right.id) ||
    compareText(left.kind, right.kind) ||
    compareText(left.source.file, right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}

/**
 * Orders primitive strings for deterministic watch indexes.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Normalizes changed source filenames relative to the project root.
 * @param file - Portable authored source filename.
 * @param projectRoot - Absolute project root for portable source paths.
 * @returns A portable project-relative changed source path.
 */
function watchPath(file: string, projectRoot?: string): string {
  try {
    return normalizeSourcePath(file, projectRoot);
  } catch (error) {
    if (!(error instanceof SourceLocationError)) throw error;
    return file.replaceAll("\\", "/").replace(/^\.\//, "");
  }
}

/**
 * Freezes map value arrays before publishing a watch index.
 * @param values - Ordered values to inspect without coercion.
 * @returns The map with copied and frozen value arrays.
 */
function freezeMap(
  values: Map<string, string[]> | Map<string, Set<string>>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...values.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, value]) => [key, Object.freeze([...value].sort(compareText))]),
  );
}
