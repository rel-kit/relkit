import { Cause, Effect, Exit } from "effect";
import { publicFailure } from "./generator-errors.js";
import { generatorCleanupFailures, recordCleanupFailure } from "./generator-cleanup.js";
import type { StageCleanupResult } from "./generate-files-utilities.types.js";

const stages = new WeakMap<object, StageCleanupResult>();

/**
 * Records an owned stage's disposition alongside the unchanged authoritative failure.
 * @param exit - Authoritative scoped exit whose primary cause must be preserved.
 * @param cleanup - Recorded staging path and cleanup disposition.
 * @param ownerOverride - Optional public owner used to retain interruption cleanup evidence.
 * @returns Completion after the existing contract has been applied.
 */
export function recordStageCleanup(
  exit: Exit.Exit<unknown, unknown>,
  cleanup: StageCleanupResult,
  ownerOverride?: unknown,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const owner = publicFailure(
      ownerOverride ?? (Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit.value),
    );
    if (typeof owner === "object" && owner !== null) stages.set(owner, cleanup);
    for (const failure of generatorCleanupFailures(cleanup))
      yield* recordCleanupFailure(exit, "stage", failure.cause, ownerOverride);
  });
}

/**
 * Retrieves staging cleanup details used by the existing public generation error formatter.
 * @param value - Public failure or cancellation owner.
 * @returns Recorded staging cleanup outcome, or undefined when no outcome was retained.
 */
export function stageCleanupFor(value: unknown): StageCleanupResult | undefined {
  const owner = publicFailure(value);
  return typeof owner === "object" && owner !== null ? stages.get(owner) : undefined;
}
