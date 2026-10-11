/**
 * Verifies checker-input reuse against real contained files and resolution probes.
 * Declaration edits, newly added shadow modules, global type directories and escaped
 * parents must reject before activation. Test scopes join all fixture cleanup.
 */
import { mkdir, mkdtemp, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { SnapshotFiles, snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import {
  captureSnapshotTypecheckInputs,
  verifySnapshotTypecheckInputs,
} from "../../src/dev-snapshot/snapshot-typecheck-inputs.js";

/** Acquires and removes only this test's physical fixture, after every read completes. */
const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-snapshot-checker-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

/**
 * Supplies one consumed declaration with unchanged-version package identity.
 * @param root - Acquired project root.
 * @returns Captured declaration and missing shadow-module evidence through the live adapter.
 */
function capture(root: string) {
  return Effect.gen(function* () {
    const text = "export declare const value: number;";
    yield* Effect.promise(async () => {
      await mkdir(join(root, "node_modules/fixture"), { recursive: true });
      await writeFile(join(root, "node_modules/fixture/index.d.ts"), "\uFEFF" + text);
    });
    const files = yield* SnapshotFiles;
    return yield* captureSnapshotTypecheckInputs(files, root, [
      { kind: "read", path: "node_modules/fixture/index.d.ts", hash: snapshotDigest(text) },
      { kind: "fileExists", path: "node_modules/fixture/index.d.ts", exists: true },
      { kind: "directoryExists", path: "node_modules/fixture", exists: true },
      { kind: "fileExists", path: "node_modules/fixture.ts", exists: false },
      { kind: "fileExists", path: "node:fs.ts", exists: false },
      { kind: "directoryExists", path: "node_modules/absent", exists: false },
      { kind: "fileExists", path: "node_modules/absent/index.d.ts", exists: false },
      { kind: "directories", path: "node_modules/@types", entries: [] },
    ]);
  });
}

it.effect("rejects changed declaration bytes even when version and timestamp stay unchanged", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const inputs = yield* capture(root);
      const files = yield* SnapshotFiles;
      yield* verifySnapshotTypecheckInputs(files, root, inputs);
      const path = join(root, "node_modules/fixture/index.d.ts");
      const before = yield* Effect.promise(() => stat(path));
      yield* Effect.promise(async () => {
        await writeFile(path, "export declare const value: string;");
        await utimes(path, before.atime, before.mtime);
      });
      expect(
        Exit.isFailure(yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs))),
      ).toBe(true);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("rechecks the stronger witnesses when redundant checker probes are omitted", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const inputs = yield* capture(root);
      const files = yield* SnapshotFiles;
      expect(
        inputs.observations.some((query) => query.path === "node_modules/fixture/index.d.ts"),
      ).toBe(false);
      expect(inputs.observations.some((query) => query.path === "node_modules/fixture")).toBe(
        false,
      );
      expect(
        inputs.observations.some((query) => query.path === "node_modules/absent/index.d.ts"),
      ).toBe(false);
      expect(inputs.observations).toContainEqual({
        kind: "directoryExists",
        path: "node_modules/absent",
        exists: false,
      });
      expect(inputs.observations).toContainEqual({
        kind: "entries",
        path: ".",
        entries: expect.any(Array),
      });
      yield* verifySnapshotTypecheckInputs(files, root, inputs);
      yield* Effect.promise(() => mkdir(join(root, "node_modules/absent")));
      const exit = yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({
          operation: "typecheck.resolutionChanged",
        });
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("retains builtin resolution probes and rejects newly created colon-named shadows", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const inputs = yield* capture(root);
      const files = yield* SnapshotFiles;
      yield* verifySnapshotTypecheckInputs(files, root, inputs);
      yield* Effect.promise(() =>
        writeFile(join(root, "node:fs.ts"), "export const value = true;"),
      );
      const exit = yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({
          operation: "typecheck.resolutionChanged",
        });
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("rejects a new shadow module while the consumed declaration remains unchanged", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const inputs = yield* capture(root);
      const files = yield* SnapshotFiles;
      yield* Effect.promise(() =>
        writeFile(join(root, "node_modules/fixture.ts"), "export const value = true;"),
      );
      const exit = yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({
          operation: "typecheck.resolutionChanged",
        });
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("rejects added global type directories and deleted consumed declarations", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const inputs = yield* capture(root);
      const files = yield* SnapshotFiles;
      yield* Effect.promise(() =>
        mkdir(join(root, "node_modules/@types/added"), { recursive: true }),
      );
      expect(
        Exit.isFailure(yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs))),
      ).toBe(true);
      yield* Effect.promise(() => rm(join(root, "node_modules/fixture/index.d.ts")));
      expect(
        Exit.isFailure(yield* Effect.exit(verifySnapshotTypecheckInputs(files, root, inputs))),
      ).toBe(true);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("rejects escaped parents even when the resolution query targets a missing file", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const external = yield* directory;
      yield* Effect.promise(() => symlink(external, join(root, "outside"), "dir"));
      const files = yield* SnapshotFiles;
      const exit = yield* Effect.exit(
        files.observations(root, [
          { kind: "fileExists", path: "outside/missing.d.ts", exists: false },
        ]),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ operation: "typecheck.containment" });
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect(
  "leaves linked package bytes to dependency capture without replaying escaped queries",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const root = yield* directory;
        const external = yield* directory;
        yield* Effect.promise(async () => {
          await mkdir(join(root, "src"), { recursive: true });
          await mkdir(join(root, "node_modules"), { recursive: true });
          await writeFile(join(root, "src/app.ts"), "export const value = true;");
          await writeFile(join(external, "package.json"), '{"name":"linked"}');
          await symlink(external, join(root, "node_modules/linked"), "dir");
        });
        const files = yield* SnapshotFiles;
        const inputs = yield* captureSnapshotTypecheckInputs(files, root, [
          {
            kind: "read",
            path: "src/app.ts",
            hash: snapshotDigest("export const value = true;"),
          },
          { kind: "directoryExists", path: "node_modules/linked", exists: true },
          { kind: "fileExists", path: "node_modules/linked/package.json", exists: true },
          { kind: "fileExists", path: "node_modules/linked/missing.d.ts", exists: false },
          { kind: "fileExists", path: "node_modules/linked.ts", exists: false },
        ]);
        expect(
          inputs.observations.some((query) => query.path.startsWith("node_modules/linked/")),
        ).toBe(false);
        expect(inputs.observations).toContainEqual({
          kind: "entries",
          path: "node_modules",
          entries: ["linked"],
        });
        yield* verifySnapshotTypecheckInputs(files, root, inputs);
      }),
    ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("refuses changed bytes between the original checker read and receipt capture", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      yield* capture(root);
      const files = yield* SnapshotFiles;
      const exit = yield* Effect.exit(
        captureSnapshotTypecheckInputs(files, root, [
          {
            kind: "read",
            path: "node_modules/fixture/index.d.ts",
            hash: snapshotDigest("obsolete check text"),
          },
        ]),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ operation: "typecheck.changed" });
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);
