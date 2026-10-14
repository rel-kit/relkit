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
