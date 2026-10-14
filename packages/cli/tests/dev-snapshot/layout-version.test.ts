/** Proves cached checks and prepared receipts reject absent or stale layout interpretation identity. */
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { APPLICATION_LAYOUT_VERSION } from "@relkit/contracts";
import { SnapshotTools } from "../../src/dev-snapshot/snapshot.schemas.js";
import { tools } from "./validation-fixture.js";

it.effect("requires the exact current layout interpretation independently of package version", () =>
  Effect.gen(function* () {
    expect(yield* Schema.decodeUnknownEffect(SnapshotTools)(tools)).toEqual(tools);
    const { layout: _layout, ...legacy } = tools;
    expect((yield* Effect.exit(Schema.decodeUnknownEffect(SnapshotTools)(legacy)))._tag).toBe(
      "Failure",
    );
    expect(
      (yield* Effect.exit(
        Schema.decodeUnknownEffect(SnapshotTools)({
          ...tools,
          layout: APPLICATION_LAYOUT_VERSION + 1,
        }),
      ))._tag,
    ).toBe("Failure");
  }),
);
