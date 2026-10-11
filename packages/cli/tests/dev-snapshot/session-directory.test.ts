/**
 * Proves exclusive invocation ownership with injected filesystem authorities.
 * Existing crash leftovers are never removed; release ordering and secondary
 * failures are verified independently from native candidate implementation.
 */
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Layer } from "effect";
import { acquireSnapshotSessionDirectory } from "../../src/dev-snapshot/snapshot-session-directory.js";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { cliAdapterError } from "../../src/cli-errors.js";
import { filesystemTestLayer } from "../services/test-layers.js";

it.effect(
  "separate invocations retain crash leftovers and release only their exclusive trees",
  () => {
    const releases: string[] = [];
    let sequence = 0;
    const layer = Layer.merge(
      cleanupLayer,
      filesystemTestLayer({
        mkdir: () => Effect.void,
        stage: (prefix) => Effect.sync(() => `${prefix}${++sequence}`),
        remove: (path) =>
          Effect.sync(() => {
            releases.push(path);
          }),
      }),
    );
    return Effect.gen(function* () {
      const first = yield* Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* acquireSnapshotSessionDirectory("/project");
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              releases.push("child-joined");
            }),
          );
          return directory;
        }),
      );
      const second = yield* Effect.scoped(acquireSnapshotSessionDirectory("/project"));
      expect(first).not.toBe(second);
      expect(releases).toEqual(["child-joined", first, second]);
      expect(releases).not.toContain("/project/.relkit/generated/generation-1");
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "directory release records the complete secondary Cause without replacing success",
  () => {
    const cause = Cause.combine(
      Cause.fail(cliAdapterError("test.remove", new Error("busy"))),
      Cause.die(new Error("secondary defect")),
    );
    const layer = Layer.merge(
      cleanupLayer,
      filesystemTestLayer({
        mkdir: () => Effect.void,
        stage: () => Effect.succeed("/project/.relkit/dev/sessions/dev-session-owned"),
        remove: () => Effect.failCause(cause),
      }),
    );
    return Effect.gen(function* () {
      const result = yield* Effect.scoped(acquireSnapshotSessionDirectory("/project"));
      expect(result).toBe("/project/.relkit/dev/sessions/dev-session-owned");
      const cleanup = yield* CliCleanup;
      const issues = yield* cleanup.snapshot();
      expect(issues).toHaveLength(1);
      expect(issues[0]?.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Die"]);
      const failed = issues[0]?.cause.reasons[0];
      const died = issues[0]?.cause.reasons[1];
      const originalFailed = cause.reasons[0];
      const originalDied = cause.reasons[1];
      if (
        failed?._tag !== "Fail" ||
        originalFailed?._tag !== "Fail" ||
        died?._tag !== "Die" ||
        originalDied?._tag !== "Die"
      )
        throw new Error("Expected both complete secondary reasons");
      expect(failed.error).toBe(originalFailed.error);
      expect(died.defect).toBe(originalDied.defect);
    }).pipe(Effect.provide(layer));
  },
);
