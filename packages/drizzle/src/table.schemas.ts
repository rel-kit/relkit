import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-orm/effect-schema";
import { getColumns, type Table } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { DrizzleFailure } from "./failure.js";

/**
 * Generates pinned Drizzle/Effect contracts without acquiring a database.
 * @param table - Declared table, retaining null/default/generated metadata.
 * @returns Select, insert and update schemas parallel to public Zod contracts.
 */
export function effectSchemasFor(table: Table) {
  // Callback refinements let the generator retain nullable/default/generated rules.
  // rc.5 uses integer bounds for floating-point columns and BigInt for string bigint.
  const refinements = Object.fromEntries(
    Object.entries(getColumns(table)).flatMap(([name, column]) => {
      let schema: Schema.Codec<unknown, unknown>;
      if (
        ["number float", "number ufloat", "number double", "number udouble"].includes(
          column.dataType,
        )
      ) {
        const maximum = column.dataType.endsWith("float")
          ? 3.4028234663852886e38
          : Number.MAX_VALUE;
        const minimum = column.dataType.includes(" u") ? 0 : -maximum;
        schema = Schema.Number.check(
          Schema.isGreaterThanOrEqualTo(minimum),
          Schema.isLessThanOrEqualTo(maximum),
        );
      } else if (column.dataType === "string int64" || column.dataType === "string uint64") {
        const unsigned = column.dataType === "string uint64";
        const minimum = unsigned ? 0n : -(1n << 63n);
        const maximum = unsigned ? (1n << 64n) - 1n : (1n << 63n) - 1n;
        schema = Schema.String.check(
          Schema.makeFilter(
            (value) =>
              (unsigned ? /^\d+$/ : /^-?\d+$/).test(value) &&
              BigInt(value) >= minimum &&
              BigInt(value) <= maximum,
          ),
        );
      } else return [];
      const dimensions = "dimensions" in column ? column.dimensions : 0;
      if (typeof dimensions === "number") {
        for (let dimension = 0; dimension < dimensions; dimension++) schema = Schema.Array(schema);
      }
      return [[name, () => schema]];
    }),
  );
  return Object.freeze({
    select: createSelectSchema(table, refinements),
    insert: createInsertSchema(table, refinements),
    update: createUpdateSchema(table, refinements),
  });
}

/**
 * Validates unknown native rows or write data at the domain boundary.
 * @param schema - Generated table contract.
 * @param value - Unknown data; never included in telemetry.
 * @returns Lazy validated value or a typed validation failure.
 */
export function decodeTableValue(schema: Schema.Codec<unknown, unknown>, value: unknown) {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => new DrizzleFailure({ operation: "validation", cause })),
  );
}
