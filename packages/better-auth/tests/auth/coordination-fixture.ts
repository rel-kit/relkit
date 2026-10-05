import { activateDrizzleService, defineDrizzleService } from "@relkit/drizzle";
import { is, StringChunk, type SQL } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";

const user = sqliteTable("user", { id: integer().primaryKey() });

/**
 * Models native SQLite transaction state and records actual raw query order.
 * @returns A scoped fake activation with stateful SQL/query observations.
 * @remarks Real Drizzle owner/admission/coordination is used; only the native DB is fake.
 */
export function coordinatedDatabase() {
  return Effect.gen(function* () {
    const events: string[] = [];
    let active = false;
    let queryInsideTransaction = false;
    const read = (kind: string) => {
      queryInsideTransaction ||= active;
      events.push(kind);
      return { id: 1 };
    };
    const client = {
      run(query: SQL) {
        const statement = query.queryChunks
          .flatMap((chunk) => (is(chunk, StringChunk) ? chunk.value : []))
          .join("");
        events.push(statement);
        if (statement === "begin") {
          if (active) throw new Error("overlapping SQLite BEGIN");
          active = true;
        } else active = false;
      },
    };
    const declaration = defineDrizzleService({
      schema: { user },
      client: () => client,
      overrides: { user: { findOne: () => read("portable") } },
    });
    const database = yield* Effect.acquireRelease(
      Effect.promise(() => activateDrizzleService(declaration, {}, { isolated: true })),
      (activation) => Effect.promise(() => activation.close()),
    );
    return { database, read, events, sawUnrelatedTransaction: () => queryInsideTransaction };
  });
}
