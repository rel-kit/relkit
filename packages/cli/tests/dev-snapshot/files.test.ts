/**
 * Exercises live bounded file authority in an owned temporary directory. Native
 * tests verify environment/state exclusions, source additions and symlink/size
 * rejection; cleanup removes only the directory acquired by each test scope.
 */
import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { SnapshotFiles, snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";

/**
 * Acquires one native fixture and joins its removal on every test outcome.
 * @returns A temporary root owned by the caller's Scope.
 */
const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-snapshot-files-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

it.effect("rejects replacement of an acquired project root even when its bytes match", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const relocation = yield* directory;
      yield* Effect.promise(() => writeFile(join(root, "input.ts"), "unchanged"));
      const files = yield* SnapshotFiles;
      expect(Buffer.from(yield* files.read(root, "input.ts", 100)).toString()).toBe("unchanged");
      yield* Effect.promise(async () => {
        await rename(root, join(relocation, "previous"));
        await mkdir(root);
        await writeFile(join(root, "input.ts"), "unchanged");
      });
      expect(Exit.isFailure(yield* Effect.exit(files.read(root, "input.ts", 100)))).toBe(true);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("enumerates helpers, assets and configs while excluding environment and state", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      yield* Effect.promise(async () => {
        await mkdir(join(root, "src"));
        await mkdir(join(root, ".relkit"));
        await mkdir(join(root, "node_modules"));
        await writeFile(join(root, "src/helper.ts"), "helper");
        await writeFile(join(root, "asset.txt"), "asset");
        await writeFile(join(root, "tsconfig.json"), "{}");
        await writeFile(join(root, ".env"), "SYNTHETIC_SECRET=never-hash-this");
        await writeFile(join(root, ".env.local"), "PRIVATE=excluded");
        await writeFile(join(root, ".relkit/state"), "user state");
        await writeFile(join(root, "node_modules/runtime.js"), "dependency");
      });
      const files = yield* SnapshotFiles;
      expect(yield* files.projectPaths(root)).toEqual([
        "asset.txt",
        "src/helper.ts",
        "tsconfig.json",
      ]);
      expect(Buffer.from(yield* files.read(root, "src/helper.ts", 6)).toString()).toBe("helper");
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("rejects direct symlinks, escaped parent links and oversized reads", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const external = yield* directory;
      yield* Effect.promise(async () => {
        await writeFile(join(root, "input.ts"), "oversized");
        await writeFile(join(external, "input.ts"), "outside bytes");
        await symlink(join(root, "input.ts"), join(root, "alias.ts"));
        await symlink(external, join(root, "outside"), "dir");
      });
      const files = yield* SnapshotFiles;
      expect(Exit.isFailure(yield* Effect.exit(files.read(root, "input.ts", 3)))).toBe(true);
      expect(Exit.isFailure(yield* Effect.exit(files.read(root, "alias.ts", 100)))).toBe(true);
      expect(Exit.isFailure(yield* Effect.exit(files.read(root, "outside/input.ts", 100)))).toBe(
        true,
      );
      expect(Exit.isFailure(yield* Effect.exit(files.projectPaths(root)))).toBe(true);
      expect(Exit.isFailure(yield* Effect.exit(files.read(root, "../input.ts", 100)))).toBe(true);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);
