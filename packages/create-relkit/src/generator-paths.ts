import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorIoError, errorMessage, hasErrno } from "./generator-errors.js";
import type { GeneratorPathsService } from "./generator-paths.types.js";

/** Read-only path authority; synchronous compatibility does not grant filesystem mutation. */
export class GeneratorPaths extends Context.Service<GeneratorPaths, GeneratorPathsService>()(
  "create-relkit/GeneratorPaths",
) {}

/**
 * Native read-only path adapter used by both Effect workflows and synchronous public validators.
 * @returns A native read-only GeneratorPaths Layer with no external service requirements.
 */
export const generatorPathsLive = Layer.effect(
  GeneratorPaths,
  Effect.gen(function* () {
    return GeneratorPaths.of({
      metadata: Effect.fn("GeneratorPaths.metadata")(
        (path) =>
          native("pathMetadata", () => lstatSync(path)).pipe(
            Effect.map((info) => ({
              kind: info.isSymbolicLink()
                ? ("symlink" as const)
                : info.isDirectory()
                  ? ("directory" as const)
                  : info.isFile()
                    ? ("file" as const)
                    : ("other" as const),
              mode: info.mode & 0o777,
            })),
            Effect.catchIf(
              (error) => hasErrno(error, "ENOENT"),
              () => Effect.succeed(undefined),
            ),
          ),
        (effect) => observeExecution("generator", "filesystem.metadata", effect),
      ),
      entries: Effect.fn("GeneratorPaths.entries")(
        (path) => native("pathEntries", () => readdirSync(path)),
        (effect) => observeExecution("generator", "filesystem.entries", effect),
      ),
      realpath: Effect.fn("GeneratorPaths.realpath")(
        (path) => native("realpath", () => realpathSync.native(path)),
        (effect) => observeExecution("generator", "filesystem.realpath", effect),
      ),
      cwd: Effect.fn("GeneratorPaths.cwd")(() =>
        observeExecution(
          "generator",
          "filesystem.cwd",
          Effect.sync(() => process.cwd()),
        ),
      ),
      home: Effect.fn("GeneratorPaths.home")(() =>
        observeExecution("generator", "filesystem.home", Effect.sync(homedir)),
      ),
      temporaryRoot: Effect.fn("GeneratorPaths.temporaryRoot")(() =>
        observeExecution("generator", "filesystem.temporaryRoot", Effect.sync(tmpdir)),
      ),
    });
  }),
);

/**
 * Adapts one synchronous native reader without hiding its expected failure or authority.
 * @typeParam A - Successful native read value.
 * @param operation - Fixed bounded operation label.
 * @param read - Synchronous read-only native operation.
 * @returns The native read's value or a GeneratorIoError retaining its original rejection.
 */
function native<A>(operation: string, read: () => A): Effect.Effect<A, GeneratorIoError> {
  return Effect.try({
    try: read,
    catch: (cause) => new GeneratorIoError({ operation, cause, message: errorMessage(cause) }),
  });
}
