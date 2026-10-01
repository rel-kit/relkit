import type { GENERATED_EXTENSION_VERSIONS } from "./generated-artifacts.js";

/** Optional generated artifacts with separately pinned versions. */
export type GeneratedExtensionKind = keyof typeof GENERATED_EXTENSION_VERSIONS;

/** A future generator's versioned artifact input. Deployment is opt-in by passing it. */
export interface GeneratedOutputExtension {
  readonly kind: GeneratedExtensionKind;
  readonly version: number;
  readonly content: string;
}

/** Exact compiler-owned artifact filename, content, and contract version. */
export interface GeneratedArtifact {
  readonly fileName: string;
  readonly content: string;
  readonly version: number;
}

/** Atomic publication result including unchanged-byte evidence. */
export interface ArtifactWriteResult {
  readonly fileName: string;
  readonly path: string;
  readonly changed: boolean;
  readonly bytes: number;
}

/** Output directory and explicit versioned artifact extensions. */
export interface GeneratedArtifactsWriteOptions {
  readonly directory: string;
  readonly extensions?: readonly GeneratedOutputExtension[];
}

/** Ordered write results and aggregate changed-byte status. */
export interface GeneratedArtifactsWriteReport {
  readonly writes: readonly ArtifactWriteResult[];
  readonly changed: boolean;
}
