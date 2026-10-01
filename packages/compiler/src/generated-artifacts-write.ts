import { observeCompiler } from "./observability.js";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { Effect, Schema } from "effect";
import { runCompilerPromise } from "./compatibility.js";
import type { ArtifactWriteResult } from "./generated-artifacts.js";

/** Expected filesystem failure with the operation, artifact path, and original cause. */
export class ArtifactIoError extends Schema.TaggedError<ArtifactIoError>()("ArtifactIoError", {
  operation: Schema.String,
  path: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Adapts a native asynchronous filesystem operation without losing cancellation.
 * @typeParam A - Native operation result.
 * @param operation - Bounded filesystem action name.
 * @param path - Artifact path used for diagnostics.
 * @param evaluate - Native operation receiving the fiber's abort signal.
 * @returns A lazy effect yielding the native result or ArtifactIoError.
 */
export function artifactIo<A>(
  operation: string,
  path: string,
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, ArtifactIoError> {
  return Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new ArtifactIoError({ operation, path, cause }),
  });
}

/**
 * Writes changed UTF-8 bytes atomically while retaining unchanged modification times.
 * @param filePath - Destination artifact path.
 * @param content - Exact UTF-8 content to publish.
 * @returns A lazy effect yielding a write report or a contextual ArtifactIoError.
 * @remarks Reads are interruptible. Once a temporary file is acquired, publication and
 * cleanup complete before cancellation. Exclusive creation establishes cleanup ownership.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { writeIfChangedEffect } from "./generated-artifacts-write.js";
 * const exit = await Effect.runPromise(Effect.exit(writeIfChangedEffect("artifact.json", "{}")));
 * ```
 */
export const writeIfChangedEffect = Effect.fn("Compiler.writeIfChanged")(
  function* (filePath: string, content: string) {
    const next = Buffer.from(content, "utf8");
    const previous = yield* artifactIo("read", filePath, (signal) =>
      readFile(filePath, { signal }),
    ).pipe(
      Effect.catchTag("ArtifactIoError", (error) =>
        isMissingFile(error.cause) ? Effect.succeed(undefined) : Effect.fail(error),
      ),
    );
    const unchanged = previous?.equals(next) ?? false;
    if (!unchanged) {
      yield* artifactIo("mkdir", filePath, () => mkdir(dirname(filePath), { recursive: true }));
      yield* Effect.scoped(
        Effect.gen(function* () {
          const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
          const handle = yield* Effect.acquireRelease(
            artifactIo("open temporary", filePath, () => open(temporary, "wx")),
            (handle) =>
              // A failed open registers no finalizer: another writer owns that path.
              artifactIo("close temporary", filePath, () => handle.close()).pipe(
                Effect.ensuring(
                  artifactIo("remove temporary", filePath, () =>
                    rm(temporary, { force: true }),
                  ).pipe(Effect.orDie),
                ),
                Effect.orDie,
              ),
          );
          yield* artifactIo("write temporary", filePath, () => handle.writeFile(next));
          yield* artifactIo("rename", filePath, () => rename(temporary, filePath));
        }),
      ).pipe(Effect.uninterruptible);
    }
    return Object.freeze({
      fileName: basename(filePath),
      path: filePath,
      changed: !unchanged,
      bytes: next.byteLength,
    });
  },
  (effect, filePath, content) =>
    observeCompiler("generation", "writeIfChanged", effect, () => ({ files: 1 })),
);

/**
 * Publishes changed artifact bytes at the legacy Promise boundary.
 * @param filePath - Destination artifact path.
 * @param content - Exact UTF-8 content.
 * @returns A Promise resolving after cleanup or rejecting with the original I/O cause.
 * @see {@link writeIfChangedEffect} for composition and ownership.
 */
export function writeIfChanged(filePath: string, content: string): Promise<ArtifactWriteResult> {
  return runCompilerPromise(
    writeIfChangedEffect(filePath, content).pipe(Effect.mapError((error) => error.cause)),
  );
}

/**
 * Identifies the only read failure that permits creation of a new artifact.
 * @param error - Native filesystem rejection.
 * @returns Whether the path was absent.
 */
function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
