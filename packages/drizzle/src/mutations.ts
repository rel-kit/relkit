import { Effect } from "effect";
import type { ModelBinding } from "./runtime-types.js";
import { nativeCall } from "./failure.js";
import { decodeTableValue } from "./table.schemas.js";
import { checked, findOne, rows } from "./queries.js";
import { call, clause, hasMethod, record, recoverable, requiredRow } from "./operations.utils.js";

/**
 * Inserts one row, recovering MySQL rows via a declared unique key.
 * @param binding - Table/client metadata.
 * @param data - Unknown insert payload.
 * @returns Lazy inserted row; validation occurs before mutation.
 */
export const insert = Effect.fn("Drizzle.insert")((binding: ModelBinding, data: unknown) =>
  Effect.gen(function* () {
    const values = yield* decodeTableValue(binding.schemas.insert, data);
    const query = yield* checked(() =>
      call(call(binding.drizzle, "insert", binding.table), "values", values),
    );
    if (hasMethod(query, "returning")) {
      const selected = yield* rows(binding, yield* checked(() => call(query, "returning")));
      return yield* checked(() => requiredRow(selected[0]));
    }
    const where = yield* checked(() => {
      const key = recoverable(binding, record(values));
      if (key === undefined)
        throw new TypeError("MySQL insert requires a recoverable unique key override");
      return key;
    });
    yield* nativeCall("insert", () => query as PromiseLike<unknown>);
    return yield* findOne(binding, where).pipe(
      Effect.flatMap((row) => checked(() => requiredRow(row))),
    );
  }),
);

/**
 * Updates one selected row with dialect-aware returning/recovery.
 * @param binding - Table/client metadata.
 * @param where - Complete unique selector.
 * @param data - Unknown partial update.
 * @returns Lazy updated row or null.
 */
export const update = Effect.fn("Drizzle.update")(
  (binding: ModelBinding, where: Record<string, unknown>, data: unknown) =>
    Effect.gen(function* () {
      const values = yield* decodeTableValue(binding.schemas.update, data);
      const before = binding.dialect === "mysql" ? yield* findOne(binding, where) : undefined;
      if (binding.dialect === "mysql" && before === null) return null;
      const query = yield* checked(() =>
        call(
          call(call(binding.drizzle, "update", binding.table), "set", values),
          "where",
          clause(binding, where),
        ),
      );
      if (hasMethod(query, "returning"))
        return (yield* rows(binding, yield* checked(() => call(query, "returning"))))[0] ?? null;
      yield* nativeCall("update", () => query as PromiseLike<unknown>);
      const recover = yield* checked(() =>
        recoverable(binding, { ...record(before), ...record(values) }),
      );
      if (recover === undefined)
        return yield* checked(() => {
          throw new TypeError("MySQL update requires a recoverable unique key override");
        });
      return yield* findOne(binding, recover);
    }),
);

/**
 * Deletes one row while preserving dialect return behavior.
 * @param binding - Table/client metadata.
 * @param where - Complete unique selector.
 * @returns Lazy deleted row or null.
 */
export const remove = Effect.fn("Drizzle.delete")(
  (binding: ModelBinding, where: Record<string, unknown>) =>
    Effect.gen(function* () {
      const before = yield* findOne(binding, where);
      if (before === null) return null;
      const query = yield* checked(() =>
        call(call(binding.drizzle, "delete", binding.table), "where", clause(binding, where)),
      );
      if (hasMethod(query, "returning"))
        return (yield* rows(binding, yield* checked(() => call(query, "returning"))))[0] ?? null;
      yield* nativeCall("delete", () => query as PromiseLike<unknown>);
      return before;
    }),
);
