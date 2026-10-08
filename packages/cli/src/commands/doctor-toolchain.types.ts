import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Read-only executable and version authority, substitutable without global Bun mutation. */
export interface DoctorToolchainOperations {
  /** Reads the executing Bun version.
   * @returns Its version through the native adapter.
   */
  readonly bunVersion: () => Effect.Effect<string>;

  /** Resolves package-owned metadata in the selected project.
   * @param root - Project resolution directory.
   * @returns The TypeScript package metadata path or an adapter failure.
   */
  readonly typeScriptPath: (root: string) => Effect.Effect<string, CliAdapterError>;

  /** Selects a local executable without spawning it.
   * @param executable - Literal executable name.
   * @returns The executable path, or null when absent.
   */
  readonly which: (executable: string) => Effect.Effect<string | null, CliAdapterError>;

  /** Checks a package semver constraint using the existing Bun semantics.
   * @param version - Installed version.
   * @param range - Authored or catalog-resolved constraint.
   * @returns Compatibility, including false for malformed constraints.
   */
  readonly satisfies: (version: string, range: string) => Effect.Effect<boolean>;
}
