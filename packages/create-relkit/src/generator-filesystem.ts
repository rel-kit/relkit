import * as fs from "node:fs/promises";
import { Context, Effect, Layer } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorIoError, errorMessage, hasErrno } from "./generator-errors.js";
import type {
  GeneratorEntryKind,
  GeneratorFileSystemService,
} from "./generator-filesystem.types.js";

/**
 * Native filesystem authority supplied through live or deterministic test Layers.
 * @remarks Mutating operations are masked until native physical settlement. This boundary
 * prevents a pending write or mkdir from racing scope rollback after interruption.
 * Readers remain interruptible; metadata checks never dereference symlinks.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { GeneratorFileSystem, generatorFileSystemLive } from "create-relkit";
 * const inspect = GeneratorFileSystem.use((fs) => fs.metadata("./package.json"));
 * const supplied = inspect.pipe(Effect.provide(generatorFileSystemLive));
 * ```
 */
export class GeneratorFileSystem extends Context.Service<
  GeneratorFileSystem,
  GeneratorFileSystemService
>()("create-relkit/GeneratorFileSystem") {}

/**
 * Live Node/Bun adapter. Mutating calls settle before scoped transaction cleanup can run.
 * @returns A native GeneratorFileSystem Layer with no external service requirements.
 */
export const generatorFileSystemLive = Layer.effect(
  GeneratorFileSystem,
  Effect.gen(function* () {
    return GeneratorFileSystem.of({
      readText: Effect.fn("GeneratorFileSystem.readText")(
        (path) => io("readText", (signal) => fs.readFile(path, { encoding: "utf8", signal })),
        (effect) => observeExecution("generator", "filesystem.readText", effect),
      ),
      readBytes: Effect.fn("GeneratorFileSystem.readBytes")(
        (path) => io("readBytes", (signal) => fs.readFile(path, { signal })),
        (effect) => observeExecution("generator", "filesystem.readBytes", effect),
      ),
      access: Effect.fn("GeneratorFileSystem.access")(
        (path) => io("access", () => fs.access(path)),
        (effect) => observeExecution("generator", "filesystem.access", effect),
      ),
      metadata: Effect.fn("GeneratorFileSystem.metadata")(
        (path) =>
          io("metadata", () => fs.lstat(path)).pipe(
            Effect.map((info) => ({ kind: entryKind(info), mode: info.mode & 0o777 })),
            Effect.catchIf(
              (error) => hasErrno(error, "ENOENT"),
              () => Effect.succeed(undefined),
            ),
          ),
        (effect) => observeExecution("generator", "filesystem.metadata", effect),
      ),
      entries: Effect.fn("GeneratorFileSystem.entries")(
        (path) =>
          io("entries", () => fs.readdir(path, { withFileTypes: true })).pipe(
            Effect.map((entries) =>
              entries.map((entry) => ({ name: entry.name, kind: entryKind(entry) })),
            ),
          ),
        (effect) => observeExecution("generator", "filesystem.entries", effect),
      ),
      write: Effect.fn("GeneratorFileSystem.write")(
        (path, content, options = {}) =>
          io("write", () => fs.writeFile(path, content, options)).pipe(Effect.uninterruptible),
        (effect) => observeExecution("generator", "filesystem.write", effect),
      ),
      mkdir: Effect.fn("GeneratorFileSystem.mkdir")(
        (path, options = {}) =>
          io("mkdir", () => fs.mkdir(path, options)).pipe(Effect.asVoid, Effect.uninterruptible),
        (effect) => observeExecution("generator", "filesystem.mkdir", effect),
      ),
      temporaryDirectory: Effect.fn("GeneratorFileSystem.temporaryDirectory")(
        (prefix) => io("temporaryDirectory", () => fs.mkdtemp(prefix)).pipe(Effect.uninterruptible),
        (effect) => observeExecution("generator", "filesystem.temporaryDirectory", effect),
      ),
      rename: Effect.fn("GeneratorFileSystem.rename")(
        (from, to) => io("rename", () => fs.rename(from, to)).pipe(Effect.uninterruptible),
        (effect) => observeExecution("generator", "filesystem.rename", effect),
      ),
      remove: Effect.fn("GeneratorFileSystem.remove")(
        (path, options = {}) =>
          io("remove", () => fs.rm(path, options)).pipe(Effect.uninterruptible),
        (effect) => observeExecution("generator", "filesystem.remove", effect),
      ),
      removeDirectory: Effect.fn("GeneratorFileSystem.removeDirectory")(
        (path) => io("removeDirectory", () => fs.rmdir(path)).pipe(Effect.uninterruptible),
        (effect) => observeExecution("generator", "filesystem.removeDirectory", effect),
      ),
      chmod: Effect.fn("GeneratorFileSystem.chmod")(
        (path, mode) => io("chmod", () => fs.chmod(path, mode)).pipe(Effect.uninterruptible),
        (effect) => observeExecution("generator", "filesystem.chmod", effect),
      ),
      glob: Effect.fn("GeneratorFileSystem.glob")(
        (root, pattern) =>
          io("glob", () =>
            Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true })),
          ).pipe(Effect.map((paths) => paths.sort())),
        (effect) => observeExecution("generator", "filesystem.glob", effect),
      ),
    });
  }),
);

/**
 * Adapts one native operation at the authority boundary.
 * @typeParam A - Native result.
 * @param operation - Fixed filesystem operation label.
 * @param execute - Native call; cancellable readers receive the fiber's AbortSignal.
 * @returns An observed typed filesystem operation.
 */
function io<A>(
  operation: string,
  execute: (signal: AbortSignal) => Promise<A>,
): Effect.Effect<A, GeneratorIoError> {
  return Effect.tryPromise({
    try: execute,
    catch: (cause) => new GeneratorIoError({ operation, cause, message: errorMessage(cause) }),
  });
}

/**
 * Classifies native entries without dereferencing a symlink.
 * @param entry - Native lstat or directory entry.
 * @returns The generator's bounded entry kind.
 */
function entryKind(entry: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): GeneratorEntryKind {
  return entry.isSymbolicLink()
    ? "symlink"
    : entry.isDirectory()
      ? "directory"
      : entry.isFile()
        ? "file"
        : "other";
}
