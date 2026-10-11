/**
 * Exercises one validation capture through the candidate service with test Layers.
 * Mutable cache bytes disappear after validation; installation still consumes only
 * the exact frozen accepted content. Epoch faults reject installation before a
 * child can be acquired, and memory bounds are enforced by receipt decoding.
 */
import { expect, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { DevSnapshots, devSnapshotsLive } from "../../src/dev-snapshot/snapshot.service.js";
import {
  SnapshotCandidates,
  snapshotCandidatesLive,
} from "../../src/dev-snapshot/snapshot-candidate.service.js";
import { SnapshotCandidateFiles } from "../../src/dev-snapshot/snapshot-candidate-files.js";
import { SnapshotProbe } from "../../src/dev-snapshot/snapshot-probe.service.js";
import { DevSnapshotRejected } from "../../src/dev-snapshot/snapshot-error.js";
import { decodeSnapshotEffect } from "../../src/dev-snapshot/snapshot-decode.js";
import type { SnapshotCandidateRequest } from "../../src/dev-snapshot/snapshot-candidate.types.js";
import type { ValidatedDevSnapshot } from "../../src/dev-snapshot/snapshot.types.js";
import { tools, validationFixture } from "./validation-fixture.js";
import { snapshotDigest } from "../../src/dev-snapshot/snapshot-fingerprint.js";

/**
 * Creates an SDK installation request with a replaceable input-epoch authority.
 * @param snapshot - Exact immutable result returned by validation.
 * @param verify - Per-call epoch admission used before and after byte installation.
 * @returns A fixture request with no child process or native resource ownership.
 */
function request(
  snapshot: ValidatedDevSnapshot,
  verify: SnapshotCandidateRequest["epoch"]["verify"],
): SnapshotCandidateRequest {
  const token = { owner: Symbol("test-epoch"), revision: 0 };
  return {
    snapshot,
    token,
    projectRoot: "/project",
    epoch: { current: Effect.succeed(token), verify, changed: Effect.never, isCurrent: () => true },
    candidate: {
      token: { sourceToken: 0, generationToken: 1 },
      projectRoot: "/project",
      outputDirectory: "/candidate",
      signal: new AbortController().signal,
    },
  };
}

/**
 * Substitutes candidate output and unused HTTP probing without any read authority.
 * @param written - Explicit test-owned content sink.
 * @returns The service Layer; requiring SnapshotFiles would fail its acquisition.
 */
function candidateLayer(written: Map<string, string>) {
  return snapshotCandidatesLive.pipe(
    Layer.provide(
      Layer.merge(
        Layer.succeed(SnapshotCandidateFiles, {
          write: (directory, path, bytes) =>
            Effect.sync(() => {
              expect(directory).toBe("/candidate");
              written.set(path, Buffer.from(bytes).toString("utf8"));
            }),
        }),
        Layer.succeed(SnapshotProbe, {
          read: () => Effect.die(new Error("Installation must not probe")),
          forward: () => Effect.die(new Error("Installation must not forward")),
        }),
      ),
    ),
  );
}

it.effect("copies the original sealed content after every cached artifact is replaced", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const snapshot = yield* DevSnapshots.use((service) =>
      service.validate(fixture.root, tools),
    ).pipe(Effect.provide(devSnapshotsLive.pipe(Layer.provide(fixture.layer))));
    for (const artifact of snapshot.artifacts)
      fixture.bytes.delete(`${fixture.capsuleRoot}/${artifact.path}`);
    expect(Object.isFrozen(snapshot.artifacts)).toBe(true);
    expect(snapshot.artifacts.every(Object.isFrozen)).toBe(true);
    const written = new Map<string, string>();
    const result = yield* SnapshotCandidates.use((service) =>
      service.install(request(snapshot, () => Effect.void)),
    ).pipe(Effect.provide(candidateLayer(written)));
    expect(result.entrypoint).toBe("server.js");
    expect(result.environment?.RELKIT_DEFERRED_INTEGRITY_HASH).toBe(
      snapshotDigest(written.get("deferred-integrity.json")!),
    );
    expect(written.size).toBe(snapshot.receipt.artifacts.length + 1);
    expect(written.get("server.js")).toBe("validated runnable fixture");
    expect(written.get("deferred.js")).toBe("validated deferred fixture");
    const deferred = snapshot.receipt.artifacts.find((member) => member.path === "deferred.js")!;
    expect(JSON.parse(written.get("deferred-integrity.json")!)).toMatchObject({
      "deferred.js": { hash: deferred.hash, bytes: deferred.bytes },
    });
  }),
);

it.effect("rejects a stale input epoch before any candidate bytes are written", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const snapshot = yield* DevSnapshots.use((service) =>
      service.validate(fixture.root, tools),
    ).pipe(Effect.provide(devSnapshotsLive.pipe(Layer.provide(fixture.layer))));
    const written = new Map<string, string>();
    const result = yield* Effect.exit(
      SnapshotCandidates.use((service) =>
        service.install(
          request(snapshot, () =>
            Effect.fail(new DevSnapshotRejected({ reason: "stale", operation: "test.epoch" })),
          ),
        ),
      ).pipe(Effect.provide(candidateLayer(written))),
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(written.size).toBe(0);
  }),
);

it.effect("rejects an otherwise valid receipt exceeding the aggregate artifact memory bound", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    const receipt = {
      ...fixture.receipt,
      artifacts: fixture.receipt.artifacts.map((member) => ({ ...member, bytes: 67_108_864 })),
    };
    expect(Exit.isFailure(yield* Effect.exit(decodeSnapshotEffect(JSON.stringify(receipt))))).toBe(
      true,
    );
  }),
);
