import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect, Schema } from "effect";
import { bigint, pgTable } from "drizzle-orm/pg-core";
import { effectSchemasFor } from "../../src/table.schemas.js";

it.effect("string bigint arrays retain dimensions and nullable/default metadata", () =>
  Effect.gen(function* () {
    const schemas = effectSchemasFor(
      pgTable("string_arrays", {
        ids: bigint({ mode: "string" }).array().notNull(),
        matrix: bigint({ mode: "string" }).array("[][]").notNull(),
        optional: bigint({ mode: "string" }).array(),
        defaults: bigint({ mode: "string" }).array().notNull().default([]),
      }),
    );
    const value = {
      ids: ["9007199254740993"],
      matrix: [["-9223372036854775808", "9223372036854775807"]],
      optional: null,
      defaults: [],
    };
    for (const schema of [schemas.select, schemas.insert, schemas.update]) {
      expect(yield* Schema.decodeUnknownEffect(schema)(value)).toEqual(value);
      for (const ids of ["1", [1n], ["9223372036854775808"], [["1"]]]) {
        expect(
          (yield* Effect.exit(Schema.decodeUnknownEffect(schema)({ ...value, ids })))._tag,
        ).toBe("Failure");
      }
    }
    expect(yield* Schema.decodeUnknownEffect(schemas.insert)({ ids: [], matrix: [] })).toEqual({
      ids: [],
      matrix: [],
    });
    expect(yield* Schema.decodeUnknownEffect(schemas.update)({})).toEqual({});
  }),
);
