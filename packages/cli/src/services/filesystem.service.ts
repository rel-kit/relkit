import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { Context, Effect, Layer } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { FileSystemCapabilities } from "./filesystem.types.js";
import { writeExclusiveEffect } from "./filesystem-exclusive.js";
import { CliCleanup, cleanupLayer } from "./cleanup.service.js";

/** Invocation-owned native filesystem access, substitutable by a deterministic Layer. */
export class CliFileSystem extends Context.Service<CliFileSystem, FileSystemCapabilities>()(
  "relkit/cli/FileSystem",
) {}

/**
 * Acquires native file adapters without acquiring project or process authority.
 * @returns A live filesystem Layer. Uncancellable mutations settle before rollback can run.
 * @remarks Copy/rename and link mutations are masked only around their native call,
 * so scope release cannot delete an in-flight staged publication.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * const exists = await Effect.runPromise(Effect.gen(function* () {
 *   const files = yield* CliFileSystem;
 *   return yield* files.exists("./package.json");
 * }).pipe(Effect.provide(fileSystemLayer)));
 * ```
 */
export const fileSystemLayer = Layer.effect(
  CliFileSystem,
  Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    return CliFileSystem.of({
      readText: Effect.fn("CliFileSystem.readText")((path: string) =>
        observeCli(
          "filesystem.readText",
          cliPromise("filesystem.readText", (signal) =>
            readFile(path, { encoding: "utf8", signal }),
          ),
        ),
      ),
      writeText: Effect.fn("CliFileSystem.writeText")((path: string, text: string) =>
        observeCli(
          "filesystem.writeText",
          cliPromise("filesystem.writeText", () => writeFile(path, text)).pipe(
            Effect.uninterruptible,
          ),
        ),
      ),
      writeExclusive: Effect.fn("CliFileSystem.writeExclusive")(
        (path: string, text: string, mode: number) =>
          observeCli(
            "filesystem.writeExclusive",
            writeExclusiveEffect(path, text, mode).pipe(Effect.provideService(CliCleanup, cleanup)),
          ),
      ),
      chmod: Effect.fn("CliFileSystem.chmod")((path: string, mode: number) =>
        observeCli(
          "filesystem.chmod",
          cliPromise("filesystem.chmod", () => chmod(path, mode)).pipe(Effect.uninterruptible),
        ),
      ),
      mkdir: Effect.fn("CliFileSystem.mkdir")((path: string) =>
        observeCli(
          "filesystem.mkdir",
          cliPromise("filesystem.mkdir", () => mkdir(path, { recursive: true })).pipe(
            Effect.asVoid,
            Effect.uninterruptible,
          ),
        ),
      ),
      remove: Effect.fn("CliFileSystem.remove")((path: string) =>
        observeCli(
          "filesystem.remove",
          cliPromise("filesystem.remove", () => rm(path, { recursive: true, force: true })).pipe(
            Effect.uninterruptible,
          ),
        ),
      ),
      copy: Effect.fn("CliFileSystem.copy")((source: string, target: string) =>
        observeCli(
          "filesystem.copy",
          cliPromise("filesystem.copy", () =>
            cp(source, target, { recursive: true, force: true }),
          ).pipe(Effect.uninterruptible),
        ),
      ),
      rename: Effect.fn("CliFileSystem.rename")((source: string, target: string) =>
        observeCli(
          "filesystem.rename",
          cliPromise("filesystem.rename", () => rename(source, target)).pipe(
            Effect.uninterruptible,
          ),
        ),
      ),
      stage: Effect.fn("CliFileSystem.stage")((prefix: string) =>
        observeCli(
          "filesystem.stage",
          cliPromise("filesystem.stage", () => mkdtemp(prefix)).pipe(Effect.uninterruptible),
        ),
      ),
      symlink: Effect.fn("CliFileSystem.symlink")((source: string, target: string) =>
        observeCli(
          "filesystem.symlink",
          cliPromise("filesystem.symlink", () => symlink(source, target, "dir")).pipe(
            Effect.uninterruptible,
          ),
        ),
      ),
      unlink: Effect.fn("CliFileSystem.unlink")((path: string) =>
        observeCli(
          "filesystem.unlink",
          cliPromise("filesystem.unlink", () => unlink(path)).pipe(Effect.uninterruptible),
        ),
      ),
      stat: Effect.fn("CliFileSystem.stat")((path: string) =>
        observeCli(
          "filesystem.stat",
          cliPromise("filesystem.stat", () => stat(path)),
        ),
      ),
      exists: Effect.fn("CliFileSystem.exists")((path: string) =>
        observeCli(
          "filesystem.exists",
          Effect.sync(() => existsSync(path)),
        ),
      ),
      files: Effect.fn("CliFileSystem.files")((root: string, patterns: readonly string[]) =>
        observeCli(
          "filesystem.files",
          cliTry("filesystem.files", () => {
            const files = new Set<string>();
            for (const pattern of patterns)
              for (const file of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true }))
                files.add(file.replaceAll("\\", "/"));
            return [...files].sort();
          }),
        ),
      ),
    });
  }),
).pipe(Layer.provideMerge(cleanupLayer));
