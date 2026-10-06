import type { Effect, Schema } from "effect";
import type { CliAdapterError } from "../cli-errors.js";
import type { builtManifestSchema } from "./start-built.schemas.js";

/** Schema-derived current built manifest. */
export type BuiltManifest = Schema.Schema.Type<typeof builtManifestSchema>;

/** Validated artifact cohort, suitable for production startup. */
export interface BuiltProject {
  readonly graphHash: string;
  readonly manifest: BuiltManifest;
}

/** Strict build reads; all file authority belongs to the acquired Layer. */
export interface BuiltProjectOperations {
  /**
   * Reads and validates a coherent build cohort.
   * @param buildDirectory - Selected emitted build root.
   * @returns Current graph identity and manifest, or identity-preserving failure.
   */
  readonly read: (buildDirectory: string) => Effect.Effect<BuiltProject, CliAdapterError>;
}
