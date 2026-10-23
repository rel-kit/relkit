/** Verifies transaction writes reject symlink ancestors before changing bytes outside the project.
 * Both project and external target are owned temporary fixtures and close under the test scope.
 */
import { expect, it } from "@effect/vitest";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Effect, Exit } from "effect";
import { applyFileOperationsEffect } from "../src/add-transaction-files.js";
import { ADD_FAILURE_CODES, AddScaffoldError } from "../src/add-types.js";
import { publicFailure } from "../src/generator-errors.js";
import { GeneratorFileSystem, generatorFileSystemLive } from "../src/generator-filesystem.js";
import { ensureParentEffect } from "../src/generator-file-writes.js";

it.effect("rejects a symlink ancestor above an existing nested directory before writing", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-write-symlink-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    );
    const project = join(root, "project");
    const outside = join(root, "outside");
    yield* Effect.promise(async () => {
      await mkdir(project);
      await mkdir(join(outside, "services"), { recursive: true });
      await symlink(outside, join(project, "src"), "dir");
    });
    const exit = yield* Effect.exit(
      applyFileOperationsEffect(
        project,
        [{ path: "src/services/escape.ts", action: "create", content: "outside-write" }],
        new Set(),
      ),
    );
    const fs = yield* GeneratorFileSystem;
    const target = join(outside, "services/escape.ts");
    const metadata = yield* fs.metadata(target);
    const outsideContents = metadata === undefined ? undefined : yield* fs.readText(target);
    expect({ failed: Exit.isFailure(exit), outsideContents }).toEqual({
      failed: true,
      outsideContents: undefined,
    });
    if (Exit.isFailure(exit)) {
      const failure = publicFailure(Cause.squash(exit.cause));
      expect(failure).toBeInstanceOf(AddScaffoldError);
      expect(failure).toMatchObject({ code: ADD_FAILURE_CODES.collision });
    }
  }).pipe(Effect.provide(generatorFileSystemLive), Effect.scoped),
);

it.effect("retains ordinary nested writes through existing project directories", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-write-directory-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    );
    yield* Effect.promise(() => mkdir(join(root, "src/services"), { recursive: true }));
    yield* applyFileOperationsEffect(
      root,
      [{ path: "src/services/owned.ts", action: "create", content: "owned-write" }],
      new Set(),
    );
    const fs = yield* GeneratorFileSystem;
    expect(yield* fs.readText(join(root, "src/services/owned.ts"))).toBe("owned-write");
  }).pipe(Effect.provide(generatorFileSystemLive), Effect.scoped),
);

it.effect("rejects an outside parent before traversal or directory creation", () =>
  Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-parent-containment-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    );
    const outside = join(root, "outside");
    const created = new Set<string>();
    const exit = yield* Effect.exit(ensureParentEffect(join(root, "project"), outside, created));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(created.size).toBe(0);
    const fs = yield* GeneratorFileSystem;
    expect(yield* fs.metadata(outside)).toBeUndefined();
  }).pipe(Effect.provide(generatorFileSystemLive), Effect.scoped),
);
