import { normalizeSourcePath } from "@relkit/contracts";
import type { NormalizedDescriptor } from "./normalize-types.js";

export const WATCH_ARTIFACTS = Object.freeze([
  "application.graph.json",
  "runtime.manifest.ts",
  "diagnostics.json",
] as const);

export type WatchArtifactKind = (typeof WATCH_ARTIFACTS)[number];

export interface WatchDescriptorDependency {
  readonly id: string;
  readonly sourceFile: string;
  readonly dependencies: readonly string[];
}

export interface WatchDependencyIndex {
  readonly descriptors: readonly WatchDescriptorDependency[];
  readonly sourceFiles: ReadonlyMap<string, readonly string[]>;
  readonly dependants: ReadonlyMap<string, readonly string[]>;
}

export interface WatchInvalidation {
  readonly changedFiles: readonly string[];
  readonly changedDescriptorIds: readonly string[];
  readonly affectedDescriptorIds: readonly string[];
  readonly affectedFiles: readonly string[];
  readonly discoveryInvalidated: boolean;
  readonly invalidatedArtifacts: readonly WatchArtifactKind[];
}

/** Builds a stable reverse dependency index from descriptor refs, including nested refs. */
export function createWatchDependencyIndex(
  descriptors: readonly NormalizedDescriptor[],
): WatchDependencyIndex {
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
}

/** Finds changed descriptors and their transitive dependants without compiling or executing code. */
export function invalidateWatchDependencies(
  index: WatchDependencyIndex,
  changedFiles: readonly string[],
  projectRoot?: string,
): WatchInvalidation {
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
}

export const invalidateWatch = invalidateWatchDependencies;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    compareText(left.id, right.id) ||
    compareText(left.kind, right.kind) ||
    compareText(left.source.file, right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function watchPath(file: string, projectRoot?: string): string {
  try {
    return normalizeSourcePath(file, projectRoot);
  } catch {
    return file.replaceAll("\\", "/").replace(/^\.\//, "");
  }
}

function freezeMap(
  values: Map<string, string[]> | Map<string, Set<string>>,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    [...values.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, value]) => [key, Object.freeze([...value].sort(compareText))]),
  );
}
