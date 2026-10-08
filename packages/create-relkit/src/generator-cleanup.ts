import { Cause, Effect, Exit } from "effect";
import { publicFailure } from "./generator-errors.js";
import type { GeneratorCleanupFailure } from "./generator-cleanup.types.js";
export type { GeneratorCleanupFailure } from "./generator-cleanup.types.js";

// Weak ownership retains diagnostics without extending the lifetime of project results or errors.
const failures = new WeakMap<object, readonly GeneratorCleanupFailure[]>();

/**
 * Reads secondary cleanup evidence without changing error identity or enumerable JSON contracts.
 * @param value - Original public failure or completed result.
 * @returns Immutable resource-release diagnostics, empty when cleanup succeeded.
 */
export function generatorCleanupFailures(value: unknown): readonly GeneratorCleanupFailure[] {
  const owner = publicFailure(value);
  return typeof owner === "object" && owner !== null ? (failures.get(owner) ?? []) : [];
}

/**
 * Attaches bounded release evidence to the original scoped exit's public owner.
 * @param exit - Authoritative exit whose failure must not be replaced by release failure.
 * @param operation - Fixed resource-release operation.
 * @param cause - Original cleanup rejection, available for explicit diagnostic inspection.
 * @returns Best-effort bounded warning after evidence has been retained.
 * @param ownerOverride - Optional public owner used to retain interruption cleanup evidence.
 */
export function recordCleanupFailure(
  exit: Exit.Exit<unknown, unknown>,
  operation: GeneratorCleanupFailure["operation"],
  cause: unknown,
  ownerOverride?: unknown,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const owner = publicFailure(
      ownerOverride ?? (Exit.isFailure(exit) ? Cause.squash(exit.cause) : exit.value),
    );
    if (typeof owner === "object" && owner !== null) {
      const original = publicFailure(cause);
      failures.set(
        owner,
        boundedEvidence([
          ...generatorCleanupFailures(owner),
          Object.freeze({ operation, cause: original }),
          ...(owner === original ? [] : generatorCleanupFailures(original)),
        ]),
      );
    }
    yield* Effect.annotateLogs(Effect.logWarning("Generator resource cleanup failed"), {
      domain: "generator",
      operation,
      outcome: "cleanup-failed",
    }).pipe(Effect.catchCause(() => Effect.void));
  });
}

/**
 * Retains release diagnostics when an existing compatibility contract translates a native failure.
 * @param original - Original scoped failure.
 * @param translated - Existing public error constructor chosen by the edge adapter.
 * @returns The translated error with the original release evidence.
 * @typeParam A - Public translated owner type preserved by the returned object.
 */
export function transferCleanupFailures<A extends object>(original: unknown, translated: A): A {
  const evidence = generatorCleanupFailures(original);
  if (evidence.length > 0 && original !== translated)
    failures.set(
      translated,
      boundedEvidence([...generatorCleanupFailures(translated), ...evidence]),
    );
  return translated;
}

/**
 * Keeps the initial release failure and the latest diagnostics under repeated error reuse.
 * @param evidence - Evidence collected for one public owner.
 * @returns At most 128 immutable diagnostics, retaining the first and recent failures.
 */
function boundedEvidence(
  evidence: readonly GeneratorCleanupFailure[],
): readonly GeneratorCleanupFailure[] {
  const first = evidence[0];
  return Object.freeze(
    evidence.length <= 128 || first === undefined
      ? [...evidence]
      : [first, ...evidence.slice(-127)],
  );
}
