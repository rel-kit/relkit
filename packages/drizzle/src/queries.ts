import { asc, desc } from "drizzle-orm";
import { Effect } from "effect";
import type { ModelBinding } from "./runtime-types.js";
import { DrizzleFailure, nativeCall } from "./failure.js";
import { decodeTableValue } from "./table.schemas.js";
import { call, clause, columnFor, integer, record } from "./operations.utils.js";

/**
 * Selects one unique row and validates persisted data.
 * @param binding - Table/client metadata.
 * @param where - Complete unique selector.
 * @returns Lazy row or null when absent.
 */
export const findOne = Effect.fn("Drizzle.findOne")(
  (binding: ModelBinding, where: Record<string, unknown>) =>
    Effect.gen(function* () {
      const query = yield* checked(() =>
        call(
          call(
            call(call(binding.drizzle, "select"), "from", binding.table),
            "where",
            clause(binding, where),
          ),
          "limit",
          1,
        ),
      );
      const selected = yield* rows(binding, query);
      return selected[0] ?? null;
    }),
);

/**
 * Selects a bounded ordered page.
 * @param binding - Table/client metadata.
 * @param args - Filter/order/pagination arguments.
 * @returns Lazy validated rows in native ordering.
 */
export const findMany = Effect.fn("Drizzle.findMany")(
  (binding: ModelBinding, args: Record<string, unknown>) =>
    Effect.gen(function* () {
      const query = yield* checked(() => {
        const limit = integer(args.limit, "limit", 100, 1_000);
        const offset = integer(args.offset, "offset", 0);
        let query = call(call(binding.drizzle, "select"), "from", binding.table);
        if (args.where !== undefined)
          query = call(query, "where", clause(binding, record(args.where)));
        if (args.orderBy !== undefined) {
          const order = record(args.orderBy);
          if (typeof order.field !== "string" || order.field === "")
            throw new TypeError("orderBy.field is invalid");
          const column = columnFor(binding, order.field);
          if (order.direction !== "asc" && order.direction !== "desc")
            throw new TypeError("orderBy.direction must be asc or desc");
          query = call(query, "orderBy", order.direction === "asc" ? asc(column) : desc(column));
        }
        return call(call(query, "limit", limit), "offset", offset);
      });
      return yield* rows(binding, query);
    }),
);

/**
 * Awaits native rows then validates sequentially without starting new SDK work.
 * @param binding - Select schema.
 * @param query - Uncancellable native thenable.
 * @returns Lazy validated row array, preserving order and first failure.
 */
export function rows(binding: ModelBinding, query: unknown) {
  return Effect.gen(function* () {
    const value = yield* nativeCall("query", () => query as PromiseLike<unknown>);
    if (!Array.isArray(value))
      return yield* checked(() => {
        throw new TypeError("Drizzle query did not return rows");
      });
    return yield* Effect.forEach(value, (row) => decodeTableValue(binding.schemas.select, row));
  });
}

/**
 * Converts expected synchronous argument/native-builder exceptions.
 * @typeParam A - Result of pure/native-builder validation.
 * @param run - Suspended synchronous boundary.
 * @returns Lazy value or typed failure with original cause.
 */
export function checked<A>(run: () => A): Effect.Effect<A, DrizzleFailure> {
  return Effect.try({
    try: run,
    catch: (cause) => new DrizzleFailure({ operation: "validation", cause }),
  });
}
