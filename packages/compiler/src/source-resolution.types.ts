/**
 * Defines the compiler's declaration-only module resolution seam. Resolution
 * records external packages separately from unresolved application references;
 * application boundary policy remains owned by normalization.
 */
import type { Effect } from "effect";

/** Static import result with physical authored paths and explicit analysis limits. */
export type SourceDependency =
  | { readonly kind: "source"; readonly file: string }
  | { readonly kind: "external" }
  | { readonly kind: "unresolved"; readonly application: boolean };

/** Module resolution operations supplied by live and deterministic test Layers. */
export interface SourceResolutionOperations {
  /**
   * Resolves a literal without importing the target module.
   * @param file - Contained project-relative importer.
   * @param specifier - Literal module target from source syntax.
   * @returns A lazy resolution outcome; unexpected TypeScript defects propagate.
   */
  readonly resolve: (file: string, specifier: string) => Effect.Effect<SourceDependency>;
}

/** Invocation-local authored text and canonical project root. */
export interface SourceResolutionInput {
  readonly root: string;
  readonly sources: ReadonlyMap<string, string>;
}

/** Module reference collected from static, type-only, re-export or dynamic syntax. */
export interface SourceModuleReference {
  readonly specifier?: string;
  readonly position: number;
  readonly dynamic: boolean;
}
