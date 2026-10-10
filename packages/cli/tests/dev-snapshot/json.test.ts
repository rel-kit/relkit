/**
 * Verifies exact cohort decoding without an intermediate recursive JSON codec.
 * The document owner's schema still validates every field and retains per-call
 * services, defects, interruption, and once-only transformation execution.
 */
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Cause, Context, Effect, Exit, Schema, SchemaGetter, SchemaIssue } from "effect";
import { decodeSnapshotJson } from "../../src/dev-snapshot/snapshot-json.js";
import { DevSnapshotRejected } from "../../src/dev-snapshot/snapshot-error.js";

class RequestPrefix extends Context.Service<RequestPrefix, string>()("SnapshotJson.Prefix") {}

it.effect("validates complete JSON structure and rejects malformed syntax", () =>
  Effect.gen(function* () {
    const schema = Schema.Struct({ count: Schema.Number.check(Schema.isInt()) });
    expect(yield* decodeSnapshotJson(schema, Buffer.from('{"count":2}'))).toEqual({ count: 2 });
    for (const source of ["{", '{"count":"2"}', '{"count":2.5}', "null", "[]"]) {
      const exit = yield* Effect.exit(decodeSnapshotJson(schema, Buffer.from(source)));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({
          _tag: "DevSnapshotRejected",
          operation: "cohort.decode",
        });
    }
  }),
);

it.effect("retains exact decoding requirements and each call's current context", () =>
  Effect.gen(function* () {
    const schema = Schema.String.pipe(
      Schema.decode({
        decode: SchemaGetter.transformEffect((value) =>
          Effect.service(RequestPrefix).pipe(Effect.map((prefix) => prefix + value)),
        ),
        encode: SchemaGetter.passthrough(),
      }),
    );
    const program = decodeSnapshotJson(schema, Buffer.from('"value"'));
    expectTypeOf(program).toEqualTypeOf<
      Effect.Effect<string, DevSnapshotRejected, RequestPrefix>
    >();
    expect(yield* program.pipe(Effect.provideService(RequestPrefix, "first:"))).toBe("first:value");
    expect(yield* program.pipe(Effect.provideService(RequestPrefix, "second:"))).toBe(
      "second:value",
    );
  }),
);

it.effect("preserves mixed causes without replaying the document transformation", () =>
  Effect.gen(function* () {
    const defect = new Error("decoder defect");
    const cause = Cause.combine(
      Cause.fail(new SchemaIssue.InvalidValue({ message: "rejected" })),
      Cause.combine(Cause.die(defect), Cause.interrupt(42)),
    );
    let runs = 0;
    const schema = Schema.String.pipe(
      Schema.decode({
        decode: SchemaGetter.transformEffect((_value: string) => {
          runs++;
          return Effect.failCause(cause);
        }),
        encode: SchemaGetter.passthrough(),
      }),
    );
    const exit = yield* Effect.exit(decodeSnapshotJson(schema, Buffer.from('"value"')));
    expect(runs).toBe(1);
    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Die", "Interrupt"]);
    expect(exit.cause.reasons[1]).toBe(cause.reasons[1]);
    expect(exit.cause.reasons[2]).toBe(cause.reasons[2]);
  }),
);
