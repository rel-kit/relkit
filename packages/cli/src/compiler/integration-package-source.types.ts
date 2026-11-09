import type { Effect } from "effect";
import type { IntegrationPackageIoError } from "./integration-package-source.js";
import type { IntegrationPackageValidationError } from "./integration-package-errors.js";

/** Native package metadata capabilities, injectable without evaluating package exports. */
export interface CompilerPackageSourceService {
  /**
   * Resolves an import to its canonical filesystem entry.
   * @param specifier - Package import or export specifier.
   * @param base - Directory used for module resolution.
   * @returns A lazy effect yielding the canonical entry or contextual I/O failure.
   */
  readonly resolve: (
    specifier: string,
    base: string,
  ) => Effect.Effect<string, IntegrationPackageIoError>;

  /**
   * Reads parsed package metadata from an existing manifest.
   * @param path - Absolute package manifest filename.
   * @returns A lazy effect yielding a decoded object; syntax/read failures and invalid root shapes are typed failures.
   */
  readonly readManifest: (
    path: string,
  ) => Effect.Effect<
    Record<string, unknown>,
    IntegrationPackageIoError | IntegrationPackageValidationError
  >;

  /**
   * Tests whether a package metadata file exists.
   * @param path - Absolute candidate manifest path.
   * @returns A lazy effect yielding native existence evidence.
   */
  readonly exists: (path: string) => Effect.Effect<boolean>;

  /**
   * Resolves filesystem aliases before containment checks.
   * @param path - Absolute directory or entry path.
   * @returns A lazy effect yielding the real path or contextual I/O failure.
   */
  readonly canonical: (path: string) => Effect.Effect<string, IntegrationPackageIoError>;
}
