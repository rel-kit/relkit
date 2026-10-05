import { is, StringChunk, type SQL } from "drizzle-orm";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { Context, Layer } from "effect";
import { DrizzleOwner, drizzleOwnerLayer, makeDrizzleOwner } from "../../src/owner.js";
import { drizzleRuntimeOf, defineDrizzleService } from "../../src/service.js";

export const records = sqliteTable("records", { id: integer().primaryKey() });

/** Deterministic externally controlled native Promise completion. */
export function gate<A>() {
  let resolve: (value: A) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<A>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

/** Fake SQLite wrapper with transaction commands and strict overlap checking. */
export function sqliteClient(physical = {}) {
  const statements: string[] = [];
  const failures = new Map<string, unknown>();
  let active = false;
  return {
    $client: physical,
    statements,
    failures,
    transactionActive: () => active,
    run(query: SQL) {
      const statement = query.queryChunks
        .flatMap((chunk) => (is(chunk, StringChunk) ? [chunk.value] : []))
        .join("");
      statements.push(statement);
      if (failures.has(statement)) {
        const failure = failures.get(statement);
        failures.delete(statement);
        throw failure;
      }
      if (statement === "begin") {
        if (active) throw new Error("overlapping BEGIN");
        active = true;
      } else {
        active = false;
      }
    },
  };
}

/** Substitutes the owner contract with deterministic test resources. */
export const testOwnerLayer = Layer.effect(DrizzleOwner, makeDrizzleOwner({ test: true }));

/** Supplies the production acquisition Layer with deterministic native dependencies. */
export const fakeLiveOwnerLayer = drizzleOwnerLayer(
  drizzleRuntimeOf(
    defineDrizzleService({
      schema: { records },
      client: () => ({ test: true }),
    }),
  ),
  {},
);

export const noInstrumentation = Context.empty();
