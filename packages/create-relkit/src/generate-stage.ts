/**
 * Acquires and publishes the sibling directory used by atomic project creation.
 * A Scope removes only its unpublished stage and attaches cleanup disposition
 * to the authoritative failure. Native rename settles before ownership transfers,
 * preventing cancellation from exposing an incomplete destination.
 */
import { basename, dirname, join } from "node:path";
import { Cause, Effect, Exit, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { cleanupStagedProjectEffect } from "./generate-files.js";
import { recordCleanupFailure } from "./generator-cleanup.js";
import { recordStageCleanup } from "./generate-stage-cleanup.js";
import { domainTry } from "./generator-errors.js";
import { injectGenerateFailure, throwIfAborted } from "./generate-process.js";
import type { GenerateProjectContext } from "./generate-types.js";
import type { GenerationStage } from "./generate-stage.types.js";

/** Acquires one private sibling stage with rollback in the calling Scope.
 * @param destination - Already validated final project directory.
 * @param context - Creation cancellation authority.
 * @returns Scoped ownership requiring GeneratorFileSystem; native failures remain typed.
 */
export const acquireGenerationStage = Effect.fn("ProjectGeneration.acquireStage")(
  function* (destination: string, context: GenerateProjectContext) {
    const fs = yield* GeneratorFileSystem;
    return yield* Effect.acquireRelease(
      Effect.gen(function* () {
        yield* fs.mkdir(dirname(destination), { recursive: true, mode: 0o755 });
        const stage = yield* fs.temporaryDirectory(
          join(dirname(destination), `.${basename(destination)}-relkit-`),
        );
        return { stage, published: yield* Ref.make(false) };
      }),
      (owned, exit) =>
        Effect.gen(function* () {
          if (yield* Ref.get(owned.published)) return;
          const cleanup = yield* cleanupStagedProjectEffect(owned.stage, destination).pipe(
            Effect.catchCause((cause) =>
              Effect.gen(function* () {
                const retained = { temporaryPath: owned.stage, removed: false };
                yield* recordCleanupFailure(Exit.succeed(retained), "stage", Cause.squash(cause));
                return retained;
              }),
            ),
          );
          yield* recordStageCleanup(
            exit,
            cleanup,
            context.signal?.aborted ? context.signal : undefined,
          );
        }),
    );
  },
  (effect) => observeExecution("generator", "generation.acquireStage", effect),
);

/** Atomically transfers a complete installed/prepared stage to the destination.
 * @param owned - Stage acquired in this creation Scope.
 * @param destination - Validated final directory.
 * @param context - Failure injection and cancellation authority.
 * @returns Completion after native rename and ownership bookkeeping settle together.
 */
export const publishGenerationStage = Effect.fn("ProjectGeneration.publishStage")(
  function* (owned: GenerationStage, destination: string, context: GenerateProjectContext) {
    yield* domainTry(() => {
      throwIfAborted(context.signal);
      injectGenerateFailure(context, "rename");
    });
    const fs = yield* GeneratorFileSystem;
    yield* Effect.uninterruptible(
      fs.rename(owned.stage, destination).pipe(Effect.tap(() => Ref.set(owned.published, true))),
    );
  },
  (effect) => observeExecution("generator", "generation.publishStage", effect),
);
