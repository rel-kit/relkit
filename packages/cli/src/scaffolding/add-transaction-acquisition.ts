/** Acquires rollback and marker ownership before any scaffold source mutation. */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Cause, Effect, Exit } from "effect";

import { type ScaffoldPlan } from "create-relkit/internal/add-types";
import {
  restoreFilesEffect,
  snapshotFilesEffect,
} from "create-relkit/internal/add-transaction-files";
import { GeneratorFileSystem } from "create-relkit/internal/generator-filesystem";

import type { ApplyScaffoldContext } from "./add-transaction.types.js";
import { recordCleanupFailure } from "create-relkit/internal/generator-cleanup";

export const acquireScaffoldTransaction = Effect.fn("ScaffoldTransaction.acquire")(function* (
  plan: ScaffoldPlan,
  context: ApplyScaffoldContext,
  installRequired: boolean,
) {
  const fs = yield* GeneratorFileSystem;
  return yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const snapshots = yield* snapshotFilesEffect(
        plan.projectRoot,
        plan.operations,
        installRequired,
      );
      const marker = join(
        plan.projectRoot,
        `.relkit-scaffold-${globalThis.process.pid}-${randomUUID()}.tmp`,
      );
      yield* fs.write(marker, "", { flag: "wx" });
      return { snapshots, marker, createdDirectories: new Set<string>() };
    }),
    (owned, exit) =>
      Effect.gen(function* () {
        if (Exit.isFailure(exit))
          yield* restoreFilesEffect(owned.snapshots, owned.createdDirectories).pipe(
            Effect.catchCause((cause) =>
              recordCleanupFailure(
                exit,
                "rollback",
                Cause.squash(cause),
                context.signal?.aborted ? context.signal : undefined,
              ),
            ),
          );
        yield* fs
          .remove(owned.marker, { force: true })
          .pipe(
            Effect.catchCause((cause) =>
              recordCleanupFailure(
                exit,
                "marker",
                Cause.squash(cause),
                context.signal?.aborted ? context.signal : undefined,
              ),
            ),
          );
      }),
  );
});
