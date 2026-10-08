import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { checkPostgresConsumer, formatPostgresDiagnostics } from "./postgres-declarations.js";

const consumer = `
import { PgClient } from "@effect/sql-pg";
import { Effect } from "effect";
import type { SqlError } from "effect/sql/SqlError";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { sql } from "drizzle-orm";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";

declare const db: PgDrizzle.EffectPgDatabase;
declare const client: PgClient.PgClient;
const transaction = db.transaction(() => Effect.succeed(1));
const query = db.execute(sql\`select 1\`);
const listen = client.listen("effect_mq_compile_probe");

type IsAny<T> = 0 extends (1 & T) ? true : false;
const transactionIsAny: IsAny<Effect.Error<typeof transaction>> = false;
const transactionHasSqlError: [SqlError] extends [Effect.Error<typeof transaction>] ? true : false = true;
const transactionErrors: Effect.Effect<number, SqlError> = transaction;
const queryIsAny: IsAny<Effect.Error<typeof query>> = false;
const queryHasDrizzleError: [EffectDrizzleQueryError] extends [Effect.Error<typeof query>] ? true : false = true;
const listenIsAny: IsAny<Effect.Error<typeof listen>> = false;
const listenHasSqlError: [SqlError] extends [Effect.Error<typeof listen>] ? true : false = true;

// A typed SQL failure and the client's acquisition authority cannot disappear.
// @ts-expect-error Transactions cannot be presented as infallible.
const infallibleTransaction: Effect.Effect<number> = transaction;
// @ts-expect-error PostgreSQL acquisition still requires a provided PgClient.
Effect.runPromise(PgDrizzle.makeWithDefaults());
// @ts-expect-error LISTEN requires a lifetime owner even with a concrete client.
Effect.runPromise(listen);
`;

it.effect("checks native PostgreSQL declarations without skipping dependency errors", () =>
  Effect.sync(() => {
    const diagnostics = checkPostgresConsumer(consumer);
    expect(formatPostgresDiagnostics(diagnostics)).toBe("");
  }),
);

it.effect("rejects a transaction error channel widened to any", () =>
  Effect.sync(() => {
    const diagnostics = checkPostgresConsumer(
      consumer.replace(
        "const transaction = db.transaction(() => Effect.succeed(1));",
        "declare const transaction: Effect.Effect<number, any>;",
      ),
    );
    expect(formatPostgresDiagnostics(diagnostics)).toContain("transactionIsAny");
    expect(diagnostics.some((diagnostic) => diagnostic.code === 2322)).toBe(true);
  }),
);

it.effect("rejects a transaction error channel with its SqlError removed", () =>
  Effect.sync(() => {
    const diagnostics = checkPostgresConsumer(
      consumer.replace(
        "const transaction = db.transaction(() => Effect.succeed(1));",
        "declare const transaction: Effect.Effect<number>;",
      ),
    );
    expect(formatPostgresDiagnostics(diagnostics)).toContain("transactionHasSqlError");
    expect(diagnostics.some((diagnostic) => diagnostic.code === 2322)).toBe(true);
  }),
);
