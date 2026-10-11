/**
 * Supplies deterministic publication mutations over the existing cohort fixture.
 * Each stage records ownership and cleanup; pointer changes and generation copies
 * are explicit so tests can inject obsolete epochs, corruption and cancellation.
 */
import { Effect, Layer } from "effect";
import { validationFixture } from "./validation-fixture.js";
import { SnapshotPublicationNative } from "../../src/dev-snapshot/snapshot-publication-native.js";
import { snapshotPublicationLive } from "../../src/dev-snapshot/snapshot-publication.service.js";
import type {
  SnapshotPublicationNativeOperations,
  SnapshotPublicationStage,
} from "../../src/dev-snapshot/snapshot-publication.types.js";

/**
 * Builds an accepted source capsule and independently tracked publication stage.
 * @returns Storage, input receipt, lifecycle events and complete service test Layer.
 */
export function publicationFixture() {
  const fixture = validationFixture();
  const events: string[] = [];
  let next = 0;
  const sourceDirectory = `${fixture.root}/.relkit/prepared`;
  for (const member of fixture.receipt.artifacts)
    fixture.bytes.set(
      `${sourceDirectory}/${member.path}`,
      fixture.bytes.get(`${fixture.capsuleRoot}/${member.path}`)!,
    );
  const operations: SnapshotPublicationNativeOperations = {
    stage: (root) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const directory = `${root}/.relkit/dev/.prepare-${next++}`;
          events.push(`acquired:${directory}`);
          return { projectRoot: root, directory };
        }),
        (stage) =>
          Effect.sync(() => {
            events.push(`released:${stage.directory}`);
            for (const path of fixture.bytes.keys())
              if (path.startsWith(stage.directory + "/")) fixture.bytes.delete(path);
          }),
      ),
    write: (stage, path, bytes) =>
      Effect.sync(() => {
        fixture.bytes.set(`${stage.directory}/${path}`, Buffer.from(bytes).toString("utf8"));
      }),
    install: (stage, generation) =>
      installFixtureGeneration(fixture.bytes, events, stage, generation),
    point: (root, generation) =>
      Effect.sync(() => {
        fixture.bytes.set(
          `${root}/.relkit/dev/current.json`,
          JSON.stringify({ version: 1, generation }),
        );
        events.push("pointed");
      }),
  };
  const layer = snapshotPublicationLive.pipe(
    Layer.provide(Layer.merge(fixture.layer, Layer.succeed(SnapshotPublicationNative, operations))),
  );
  return { ...fixture, sourceDirectory, events, layer };
}

/** Moves a complete private cohort into its deterministic generation address.
 * @param members - Fixture-owned byte storage.
 * @param events - Ordered mutation evidence for the caller.
 * @param stage - Scoped publication directory.
 * @param generation - Content-addressed cohort being installed.
 * @returns Lazy idempotent fixture installation; unrelated generations are preserved.
 */
function installFixtureGeneration(
  members: Map<string, string>,
  events: string[],
  stage: SnapshotPublicationStage,
  generation: string,
) {
  return Effect.sync(() => {
    const destination = `.relkit/dev/generations/${generation.slice(7)}`;
    if (!members.has(`${stage.projectRoot}/${destination}/receipt.json`)) {
      for (const [path, bytes] of [...members]) {
        if (path.startsWith(stage.directory + "/")) {
          members.set(
            `${stage.projectRoot}/${destination}/${path.slice(stage.directory.length + 1)}`,
            bytes,
          );
          members.delete(path);
        }
      }
    }
    events.push("installed");
    return destination;
  });
}
