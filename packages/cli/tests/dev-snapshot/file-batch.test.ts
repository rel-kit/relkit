/**
 * Exercises complete native byte identities and finite descriptor ownership.
 * Test scopes remove only their acquired directories. Real file replacement,
 * escaped parents and failed sibling releases verify the live adapter boundary.
 */
import { fstatSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { SnapshotFiles, snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";
import {
  closeSnapshotBatch,
  openSnapshotBatch,
} from "../../src/dev-snapshot/snapshot-file-batch.js";

/** Acquires a real isolated root and joins removal after descriptors have closed. */
const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-snapshot-batch-"))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
);

it.effect("hashes every complete byte in caller order across descriptor batches", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const paths = Array.from({ length: 65 }, (_, index) => `${index}.ts`);
      yield* Effect.forEach(
        paths,
        (path) => Effect.promise(() => writeFile(join(root, path), path)),
        { concurrency: 1, discard: true },
      );
      const files = yield* SnapshotFiles;
      const expected = paths.map((path) => ({
        path,
        bytes: Buffer.byteLength(path),
        hash: snapshotDigest(path),
      }));
      expect(yield* files.identities(root, paths, 100)).toEqual(expected);
      yield* Effect.promise(() => writeFile(join(root, "32.ts"), "other"));
      expect(yield* files.identities(root, paths, 100)).not.toEqual(expected);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("rejects escaped parents, direct links, oversized bytes and an oversized batch", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const external = yield* directory;
      yield* Effect.promise(async () => {
        await writeFile(join(root, "input.ts"), "inside");
        await writeFile(join(external, "input.ts"), "outside");
        await symlink(join(root, "input.ts"), join(root, "alias.ts"));
        await symlink(external, join(root, "outside"), "dir");
      });
      const files = yield* SnapshotFiles;
      for (const paths of [["alias.ts"], ["outside/input.ts"], ["../input.ts"]])
        expect(Exit.isFailure(yield* Effect.exit(files.identities(root, paths, 100)))).toBe(true);
      expect(Exit.isFailure(yield* Effect.exit(files.identities(root, ["input.ts"], 3)))).toBe(
        true,
      );
      expect(() => openSnapshotBatch(root, Array(129).fill("input.ts"))).toThrow();
      expect(
        Exit.isFailure(
          yield* Effect.exit(files.identities(root, Array(20_001).fill("input.ts"), 100)),
        ),
      ).toBe(true);
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("never replaces the acquired root witness with a new matching directory", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const retained = yield* directory;
      yield* Effect.promise(() => writeFile(join(root, "input.ts"), "same bytes"));
      const files = yield* SnapshotFiles;
      yield* files.identities(root, ["input.ts"], 100);
      yield* Effect.promise(async () => {
        await rename(root, join(retained, "previous"));
        await mkdir(root);
        await writeFile(join(root, "input.ts"), "same bytes");
      });
      expect(Exit.isFailure(yield* Effect.exit(files.identities(root, ["input.ts"], 100)))).toBe(
        true,
      );
    }),
  ).pipe(Effect.provide(snapshotFilesLive)),
);

it.effect("attempts every owned close after a sibling release has already failed", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      yield* Effect.promise(() => writeFile(join(root, "input.ts"), "bytes"));
      const first = openSnapshotBatch(root, ["input.ts"]);
      const second = openSnapshotBatch(root, ["input.ts"]);
      closeSnapshotBatch(first);
      expect(() => closeSnapshotBatch([...first, ...second])).toThrow(AggregateError);
      for (const member of second) expect(() => fstatSync(member.descriptor)).toThrow();
      expect(() => openSnapshotBatch(root, ["input.ts", "missing.ts"])).toThrow();
      const next = openSnapshotBatch(root, ["input.ts"]);
      closeSnapshotBatch(next);
    }),
  ),
);
