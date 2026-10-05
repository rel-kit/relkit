import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect, Schema } from "effect";
import { doublePrecision, pgTable, real } from "drizzle-orm/pg-core";
import { double, float, mysqlTable } from "drizzle-orm/mysql-core";
import { effectSchemasFor } from "../../src/table.schemas.js";

it.effect("floating-point schemas accept native ranges and preserve column metadata", () =>
  Effect.gen(function* () {
    const table = pgTable("measurements", {
      value: doublePrecision().notNull(),
      single: real().notNull(),
      matrix: doublePrecision().array("[][]").notNull(),
      optional: real(),
      defaults: doublePrecision().notNull().default(0),
    });
    const schemas = effectSchemasFor(table);
    const value = {
      value: Number.MAX_VALUE,
      single: 1e30,
      matrix: [[-1e100, 1e100]],
      optional: null,
      defaults: 0,
    };
    for (const schema of Object.values(schemas)) {
      expect(yield* Schema.decodeUnknownEffect(schema)(value)).toEqual(value);
      for (const single of ["1", NaN, Infinity, 1e40]) {
        expect(
          (yield* Effect.exit(Schema.decodeUnknownEffect(schema)({ ...value, single })))._tag,
        ).toBe("Failure");
      }
    }
    expect(
      yield* Schema.decodeUnknownEffect(schemas.insert)({ value: -1e100, single: 0, matrix: [] }),
    ).toEqual({ value: -1e100, single: 0, matrix: [] });
    expect(yield* Schema.decodeUnknownEffect(schemas.update)({})).toEqual({});
    const unsigned = effectSchemasFor(
      mysqlTable("unsigned_measurements", {
        value: double({ unsigned: true }).notNull(),
        single: float({ unsigned: true }).notNull(),
      }),
    );
    for (const schema of Object.values(unsigned)) {
      expect(yield* Schema.decodeUnknownEffect(schema)({ value: 1e100, single: 1e30 })).toEqual({
        value: 1e100,
        single: 1e30,
      });
      expect(
        (yield* Effect.exit(Schema.decodeUnknownEffect(schema)({ value: -1, single: 0 })))._tag,
      ).toBe("Failure");
    }
  }),
);
