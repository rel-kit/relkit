import type { LocalServiceRecipeInput } from "@relkit/local-service";
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** Success-only recipe reuse belonging to one captured development session. */
export interface DevRecipeCache {
  /**
   * Loads an accepted recipe from the current cache generation.
   * @param integrationId - Declared recipe owner.
   * @returns Original validated recipe; failures are never retained.
   */
  readonly get: (integrationId: string) => Effect.Effect<LocalServiceRecipeInput, CliAdapterError>;
  /**
   * Advances import identity and replaces the cache before subsequent lookups.
   * @returns Completion after namespace invalidation; old pending work cannot publish into this generation.
   */
  readonly invalidate: Effect.Effect<void>;
}
