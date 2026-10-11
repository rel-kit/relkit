/**
 * Exercises real atomic filesystem publication in an owned temporary project.
 * Identical writers must converge, relocated metadata must validate, and linked
 * framework parents must fail without replacing a pointer or writing outside it.
 */
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { ownedNativePromise } from "../../src/services/owned-promise.js";
import {
  SnapshotPublication,
  snapshotPublicationLive,
} from "../../src/dev-snapshot/snapshot-publication.service.js";
import {
  SnapshotPublicationNative,
  snapshotPublicationNativeLive,
} from "../../src/dev-snapshot/snapshot-publication-native.js";
import { snapshotFilesLive } from "../../src/dev-snapshot/snapshot-files.service.js";
import { DevSnapshots, devSnapshotsLive } from "../../src/dev-snapshot/snapshot.service.js";
import { tools, validationFixture } from "./validation-fixture.js";

const authorities = Layer.merge(snapshotFilesLive, snapshotPublicationNativeLive);
const services = Layer.merge(snapshotPublicationLive, devSnapshotsLive).pipe(
  Layer.provideMerge(authorities),
);

/**
 * Allocates a physical temporary root and joins cleanup on every test outcome.
 * @returns Native root owned by the caller's Scope.
 */
const directory = Effect.acquireRelease(
  ownedNativePromise("test.temporary", async () =>
    realpath(await mkdtemp(join(tmpdir(), "relkit-snapshot-publish-"))),
  ),
  (root) =>
    ownedNativePromise("test.remove", () => rm(root, { recursive: true, force: true })).pipe(
      Effect.orDie,
    ),
);

/**
 * Materializes the accepted logical fixture through joined native writes.
 * @param root - Physical temporary project root.
 * @returns Receipt and source directory for real publication.
 */
const prepare = Effect.fn("PublicationTest.prepare")(function* (root: string) {
  const fixture = validationFixture(root);
  const sourceDirectory = join(root, ".relkit/prepared");
  yield* ownedNativePromise("test.seed", async (signal) => {
    for (const [path, bytes] of fixture.bytes) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { signal });
    }
    for (const member of fixture.receipt.artifacts) {
      const path = join(sourceDirectory, member.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, fixture.bytes.get(`${fixture.capsuleRoot}/${member.path}`)!, {
        signal,
      });
    }
  });
  return { receipt: fixture.receipt, sourceDirectory };
});

it.effect(
  "real identical writers converge and the published snapshot validates after relocation",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const parent = yield* directory;
        const root = join(parent, "project");
        yield* ownedNativePromise("test.project", () => mkdir(root));
        const fixture = yield* prepare(root);
        const publication = yield* SnapshotPublication;
        const generations = yield* Effect.forEach(
          [1, 2],
          () => publication.publish(root, fixture.sourceDirectory, fixture.receipt, Effect.void),
          { concurrency: 2 },
        );
        expect(generations[0]).toBe(generations[1]);
        const snapshots = yield* DevSnapshots;
        expect((yield* snapshots.validate(root, tools)).generation).toBe(generations[0]);
        const entries = yield* ownedNativePromise("test.staging", () =>
          readdir(join(root, ".relkit/dev")),
        );
        expect(entries.some((entry) => entry.startsWith(".prepare-"))).toBe(false);
        const relocated = join(parent, "relocated");
        yield* ownedNativePromise("test.relocate", () => rename(root, relocated));
        expect((yield* snapshots.validate(relocated, tools)).generation).toBe(generations[0]);
      }),
    ).pipe(Effect.provide(services)),
);

it.effect("rejects linked framework parents before creating external publication state", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* directory;
      const external = yield* directory;
      yield* ownedNativePromise("test.link", () => symlink(external, join(root, ".relkit"), "dir"));
      const native = yield* SnapshotPublicationNative;
      expect(Exit.isFailure(yield* Effect.exit(native.stage(root)))).toBe(true);
      expect(yield* ownedNativePromise("test.external", () => readdir(external))).toEqual([]);
    }),
  ).pipe(Effect.provide(authorities)),
);
