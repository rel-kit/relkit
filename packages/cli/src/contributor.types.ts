import type { Effect, Schema } from "effect";
import type { GenerateCommandResult } from "create-relkit";
import type { CliAdapterError } from "./cli-errors.js";
import type { ContributorManifest } from "./contributor.schemas.js";

/** Package-owned validated fields plus untouched manifest metadata. */
export type ContributorPackage = Schema.Schema.Type<typeof ContributorManifest>;
/** Finite traversal state owned by one dependency-link request. */
export interface ContributorTraversal {
  readonly pending: readonly string[];
  readonly links: ReadonlyMap<string, string>;
}
/** Contributor workspace discovery, link projection and ordered native registration. */
export interface ContributorWorkspaceCapabilities {
  /**
   * Discovers workspace names with bounded independent manifest reads.
   * @param root - Repository containing the existing workspace layouts.
   * @returns Names mapped to their package roots.
   */
  readonly roots: (root: string) => Effect.Effect<ReadonlyMap<string, string>, CliAdapterError>;
  /**
   * Resolves transitive first-party and matching shared runtime links.
   * @param root - Catalog-owning repository root.
   * @param direct - Project runtime and development dependencies.
   * @param runtime - Project dependencies whose runtime identity must agree.
   * @returns Ordered package names and canonical external dependency roots.
   */
  readonly links: (
    root: string,
    direct: Readonly<Record<string, string>>,
    runtime: Readonly<Record<string, string>>,
  ) => Effect.Effect<ReadonlyMap<string, string>, CliAdapterError>;
  /**
   * Writes concrete fallbacks and workspace links, preserving unrelated fields.
   * @param projectRoot - Contributor application root.
   * @returns Sorted registered dependency names.
   */
  readonly rewrite: (projectRoot: string) => Effect.Effect<string[], CliAdapterError>;
  /**
   * Rewrites the manifest and registers links serially, stopping on nonzero exit.
   * @param projectRoot - Application about to install dependencies.
   * @returns Existing generator command result with captured output.
   */
  readonly prepare: (projectRoot: string) => Effect.Effect<GenerateCommandResult, CliAdapterError>;
}
