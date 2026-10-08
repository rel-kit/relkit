import type { ScaffoldFileOperation } from "./add-types.js";

/** Build-derived identity of a portable dependency patch shipped with this release. */
export interface DependencyPatchDescriptor {
  readonly version: string;
  readonly key: string;
  /** Asset path relative to the generator's dist directory. */
  readonly asset: string;
  /** SHA-256 of the unchanged UTF-8 patch bytes. */
  readonly hash: string;
}

/** Verified patch bytes and their canonical project-relative destination. */
export interface DependencyPatch extends DependencyPatchDescriptor {
  readonly path: string;
  readonly content: string;
}

/** Manifest repair and optional unchanged asset creation, committed by the transaction owner. */
export interface DependencyPatchPlan {
  readonly content: string;
  readonly operation?: ScaffoldFileOperation;
}
