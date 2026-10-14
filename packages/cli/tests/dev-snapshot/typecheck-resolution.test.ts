/** Rechecks native declaration bytes and resolution witnesses before prepared reuse. */
import { mkdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { SnapshotFiles, snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import {
  captureSnapshotTypecheckInputs,
  verifySnapshotTypecheckInputs,
} from "../../src/dev-snapshot/snapshot-typecheck-inputs.js";
import { capture, directory } from "./typecheck-input-fixture.js";
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

it.effect("refuses escaped installed-package queries before publishing a prepared receipt", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory,
        external = yield* directory;
      yield* Effect.promise(async () => {
        await mkdir(join(root, "src"), { recursive: true });
        await mkdir(join(root, "node_modules"), { recursive: true });
        await writeFile(join(root, "src/app.ts"), "export const value = true;");
        await writeFile(join(external, "package.json"), '{"name":"linked"}');
        await symlink(external, join(root, "node_modules/linked"), "dir");
      });
      const files = yield* SnapshotFiles;
      const exit = yield* Effect.exit(
        captureSnapshotTypecheckInputs(files, root, [
          { kind: "read", path: "src/app.ts", hash: snapshotDigest("export const value = true;") },
          { kind: "fileExists", path: "node_modules/linked/package.json", exists: true },
          { kind: "fileExists", path: "node_modules/linked/missing.d.ts", exists: false },
        ]),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ operation: "typecheck.containment" });
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
