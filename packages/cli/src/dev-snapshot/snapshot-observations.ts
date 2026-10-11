/**
 * Owns bounded replay of the compiler's positive and negative resolution queries.
 * Finite synchronous batches borrow the file service's root witness and yield
 * between batches. All native errors are translated once while containment
 * rejection remains an expected safe-path miss.
 */
import { Effect } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { DevSnapshotIoError, DevSnapshotRejected } from "./snapshot-error.js";
import { acquireSnapshotReadRoot } from "./snapshot-file-reads.js";
import { readSnapshotObservations } from "./snapshot-observation-native.js";
import type { SnapshotReadRoot, TypecheckObservation } from "./snapshot-files.types.js";

/**
 * Replays the complete query set without per-query instrumentation or timestamp shortcuts.
 * @param roots - Private root witnesses of the acquired file service.
 * @param root - Relocated project containment authority.
 * @param queries - Owner-decoded finite resolution metadata.
 * @returns Complete current observations or typed rejection/native failure after joined replay.
 */
export function snapshotObservations(
  roots: Map<string, SnapshotReadRoot>,
  root: string,
  queries: readonly TypecheckObservation[],
) {
  return observeExecution(
    "cli",
    "dev.snapshot.typecheckQueries",
    Effect.gen(function* () {
      if (queries.length > 50_000)
        return yield* new DevSnapshotRejected({
          reason: "ineligible",
          operation: "typecheck.bound",
        });
      const current: TypecheckObservation[] = [];
      for (let offset = 0; offset < queries.length; offset += 128) {
        yield* Effect.yieldNow;
        const batch = yield* Effect.try({
          try: () =>
            readSnapshotObservations(
              acquireSnapshotReadRoot(roots, root),
              queries.slice(offset, offset + 128),
            ),
          catch: (cause) =>
            cause instanceof DevSnapshotRejected
              ? cause
              : new DevSnapshotIoError({
                  operation: "typecheck.observations",
                  cause: new Error("Compiler input query failed", { cause }),
                }),
        });
        current.push(...batch);
      }
      return current;
    }),
    () => ({ queries: queries.length }),
  );
}
