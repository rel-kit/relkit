/** The safe compiler is acquired only after an edit through the existing domain Layers. */
import type { Effect, Scope } from "effect";
import type { DevCompilerOptions, EffectDevLocalCompiler } from "../commands/dev-local.types.js";
import type { CliAdapterError } from "../cli-errors.js";

/** One acquired safe compiler remains owned by the same development session Scope. */
export interface SnapshotFallbackOperations {
  readonly acquire: (
    options: DevCompilerOptions,
  ) => Effect.Effect<EffectDevLocalCompiler, CliAdapterError, Scope.Scope>;
}
