/**
 * Tests the validation service with complete file authority replaced by a Layer.
 * Source inventory faults and dependency/artifact tampering occur independently;
 * a success grants immutable cohort data, while failures acquire no executable.
 */
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import { DevSnapshots, devSnapshotsLive } from "../../src/dev-snapshot/snapshot.service.js";
import { tools, validationFixture } from "./validation-fixture.js";

/**
 * Runs the standalone service through the supplied storage Layer.
 * @param fixture - Complete cohort and current physical root.
 * @returns Its full Exit, preserving typed failure and defect/interruption channels.
 */
function validate(fixture: ReturnType<typeof validationFixture>) {
  return Effect.exit(
    DevSnapshots.use((service) => service.validate(fixture.root, tools)).pipe(
      Effect.provide(devSnapshotsLive.pipe(Layer.provide(fixture.layer))),
    ),
  );
}

it.effect("validates the complete cohort after relocation and freezes all metadata", () =>
  Effect.gen(function* () {
    const original = validationFixture();
    const relocated = validationFixture("/another/location");
    expect(original.receipt).toEqual(relocated.receipt);
    const exit = yield* validate(relocated);
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.capsuleRoot).toBe(relocated.capsuleRoot);
      expect(Object.isFrozen(exit.value.receipt.inputs[0])).toBe(true);
      expect(Object.isFrozen(exit.value.receipt.artifacts)).toBe(true);
      expect(Object.isFrozen(exit.value.graph)).toBe(true);
    }
  }),
);

it.effect(
  "source additions, deletions and byte changes invalidate independently of timestamps",
  () =>
    Effect.gen(function* () {
      for (const edit of ["add", "delete", "change"]) {
        const fixture = validationFixture();
        if (edit === "add") {
          fixture.paths.add("src/helper.ts");
          fixture.bytes.set(`${fixture.root}/src/helper.ts`, "helper");
        }
        if (edit === "delete") fixture.paths.delete("src/app.ts");
        if (edit === "change") fixture.bytes.set(`${fixture.root}/src/app.ts`, "edited");
        const exit = yield* validate(fixture);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit))
          expect(Cause.squash(exit.cause)).toMatchObject({ reason: "stale" });
      }
    }),
);

it.effect("checks deferred executable bytes and immutable dependency content", () =>
  Effect.gen(function* () {
    for (const path of ["deferred.js", "server.js", "dependency"]) {
      const fixture = validationFixture();
      const root = fixture.capsuleRoot;
      fixture.bytes.set(
        `${root}/${path === "dependency" ? "dependencies/runtime/index.js" : path}`,
        "tampered",
      );
      const exit = yield* validate(fixture);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ reason: "integrity" });
    }
  }),
);

it.effect("rejects receipt mutation even when its individual member syntax remains valid", () =>
  Effect.gen(function* () {
    const fixture = validationFixture();
    fixture.bytes.set(
      `${fixture.capsuleRoot}/receipt.json`,
      JSON.stringify({ ...fixture.receipt, entrypoint: "deferred.js" }),
    );
    const exit = yield* validate(fixture);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit))
      expect(Cause.squash(exit.cause)).toMatchObject({ operation: "receipt.address" });
  }),
);
