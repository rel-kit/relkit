/** Session-owned dotenv key provenance and the environment passed to one native candidate. */
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { FileSystemCapabilities } from "./filesystem.types.js";
import type { ProcessCapabilities } from "./process.types.js";

/** Undefined explicitly removes a previously inherited, file-managed key. */
export type DevelopmentEnvironment = Readonly<Record<string, string | undefined>>;

/** Captured native authority and provenance for one serialized project resolution. */
export interface DevelopmentEnvironmentState {
  readonly files: FileSystemCapabilities;
  readonly processes: ProcessCapabilities;
  readonly baseline: DevelopmentEnvironment;
  readonly names: readonly string[];
  readonly managed: Set<string>;
}

/** Resolves current files without mutating the CLI process environment. */
export interface DevEnvironmentOperations {
  /**
   * Loads one project's current dotenv values with session-local key ownership.
   * @param root - Canonical application root selected by the dev session.
   * @returns Fresh child values; native failures reject only this candidate.
   */
  readonly resolve: (root: string) => Effect.Effect<DevelopmentEnvironment, CliAdapterError>;
}
