import type { WATCH_ARTIFACTS } from "./watch.js";

/** Compiler artifacts invalidated by source dependency changes. */
export type WatchArtifactKind = (typeof WATCH_ARTIFACTS)[number];

/** Descriptor source ownership and direct stable reference dependencies. */
export interface WatchDescriptorDependency {
  readonly id: string;
  readonly sourceFile: string;
  readonly dependencies: readonly string[];
}

/** Source and reverse descriptor indexes owned by one accepted compilation. */
export interface WatchDependencyIndex {
  readonly descriptors: readonly WatchDescriptorDependency[];
  readonly sourceFiles: ReadonlyMap<string, readonly string[]>;
  readonly dependants: ReadonlyMap<string, readonly string[]>;
}

/** Transitive source, descriptor, and artifact changes requiring recompilation. */
export interface WatchInvalidation {
  readonly changedFiles: readonly string[];
  readonly changedDescriptorIds: readonly string[];
  readonly affectedDescriptorIds: readonly string[];
  readonly affectedFiles: readonly string[];
  readonly discoveryInvalidated: boolean;
  readonly invalidatedArtifacts: readonly WatchArtifactKind[];
}
