import { it } from "@effect/vitest";
import { expect } from "vitest";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { defineDrizzleService, drizzleRuntimeOf } from "../../src/service.js";
import { effectSchemasFor } from "../../src/table.schemas.js";

const table = sqliteTable("schema_records", {
  id: integer().primaryKey(),
  title: text().notNull(),
  note: text(),
  version: integer().notNull().default(1),
  generated: integer().generatedAlwaysAs(sql`1`),
});

const descriptor = defineDrizzleService({ schema: { table }, client: () => ({}) });
const zod = drizzleRuntimeOf(descriptor).zodSchemas.table!;
const schemas = effectSchemasFor(table);

for (const [operation, value, accepted] of [
  ["insert", { title: "hello" }, true],
  ["insert", { title: "hello", note: null }, true],
  ["insert", { note: "missing title" }, false],
  ["insert", { title: null }, false],
  ["update", {}, true],
  ["update", { note: null }, true],
  ["update", { title: null }, false],
  ["select", { id: 1, title: "hello", note: null, version: 1, generated: 1 }, true],
  ["select", { id: 1, title: "hello", version: 1, generated: 1 }, false],
  ["select", { id: "wrong", title: "hello", note: null, version: 1, generated: 1 }, false],
] as const) {
  it.effect(`${operation} schema agrees with Zod for ${JSON.stringify(value)}`, () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(Schema.decodeUnknownEffect(schemas[operation])(value));
      expect(result._tag === "Success").toBe(accepted);
      expect(zod[operation].safeParse(value).success).toBe(accepted);
    }),
  );
}

it.effect("generated insert/update fields are omitted consistently", () =>
  Effect.gen(function* () {
    const inserted = yield* Schema.decodeUnknownEffect(schemas.insert)({
      title: "hello",
      generated: 42,
    });
    expect(inserted).toEqual(zod.insert.parse({ title: "hello", generated: 42 }));
    expect(inserted).toEqual({ title: "hello" });
    const updated = yield* Schema.decodeUnknownEffect(schemas.update)({ generated: 42 });
    expect(updated).toEqual(zod.update.parse({ generated: 42 }));
  }),
);
