import { realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { Context, Effect, Layer, Option } from "effect";
import { httpBoundary, HttpBoundaryError, observeHttp } from "./http-effect.js";

/** Filesystem operations needed to resolve a confined public file. */
export class StaticFileSystem extends Context.Service<
  StaticFileSystem,
  {
    readonly realpath: (path: string) => Effect.Effect<string, HttpBoundaryError>;
    readonly isFile: (path: string) => Effect.Effect<boolean, HttpBoundaryError>;
    readonly open: (path: string) => Effect.Effect<Bun.BunFile, HttpBoundaryError>;
  }
>()("@relkit/runtime-hono/StaticFileSystem") {}

/** Resolves symlinks and creates native Bun file bodies at the filesystem boundary. */
export const StaticFileSystemLive = Layer.succeed(StaticFileSystem, {
  realpath: (path) => httpBoundary("static.realpath", () => realpath(path)),
  isFile: (path) => httpBoundary("static.stat", async () => (await stat(path)).isFile()),
  open: (path) =>
    Effect.try({
      try: () => Bun.file(path),
      catch: (cause) => new HttpBoundaryError({ operation: "static.open", cause }),
    }),
});

/** Selects a public regular file or index while preventing symlink escape. */
export class StaticFiles extends Context.Service<
  StaticFiles,
  {
    readonly find: (root: string, path: string) => Effect.Effect<Bun.BunFile | undefined>;
  }
>()("@relkit/runtime-hono/StaticFiles") {}

/** Domain layer; filesystem failures remain indistinguishable from missing files. */
export const StaticFilesLive = Layer.effect(
  StaticFiles,
  Effect.gen(function* () {
    const fs = yield* StaticFileSystem;
    return {
      find: Effect.fn("StaticFiles.find")((root: string, path: string) =>
        observeHttp(
          "static.find",
          Effect.gen(function* () {
            const actualRoot = yield* fs
              .realpath(root)
              .pipe(Effect.catch(() => Effect.succeed(root)));
            for (const candidate of [path, resolve(path, "index.html")]) {
              const result = yield* Effect.gen(function* () {
                const actual = yield* fs.realpath(candidate);
                const child = relative(actualRoot, actual);
                if (child === ".." || child.startsWith(`..${sep}`) || !(yield* fs.isFile(actual)))
                  return undefined;
                return yield* fs.open(actual);
              }).pipe(Effect.option);
              if (Option.isSome(result) && result.value !== undefined) return result.value;
            }
            return undefined;
          }),
        ),
      ),
    };
  }),
);
