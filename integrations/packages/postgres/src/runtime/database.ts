/**
 * Owns one Postgres connection pool for a backend namespace. The pool is a
 * `@effect/sql-pg` Layer held by a ManagedRuntime; acquiring it applies the
 * idempotent DDL inside a transaction holding an advisory lock, so instances
 * that start together create the tables once. Background loops are forked into
 * the same runtime and interrupted before the pool closes.
 */
import { PgClient } from "@effect/sql-pg";
import { detectRuntime } from "relkit/runtime";
import { Data, Effect, Fiber, Layer, ManagedRuntime, Redacted } from "effect";
import * as SqlClient from "effect/sql/SqlClient";
import { SqlError } from "effect/sql/SqlError";
import { postgresBackendSql, postgresTables } from "../schema.js";
import type { PostgresTables } from "../schema.types.js";
import type {
  BackgroundFiber,
  PostgresDatabase,
  PostgresDatabaseOptions,
} from "./database.types.js";
export type * from "./database.types.js";

/** A SQL statement of the Postgres backend failed. @experimental */
export class PostgresBackendError extends Data.TaggedError("PostgresBackendError")<{
  /** Backend operation that issued the statement, such as `jobs.submit`. */
  readonly operation: string;
  /** Driver failure; its message may include SQL state but never bound values. */
  readonly cause: SqlError;
  /** Summary safe to log. */
  readonly message: string;
}> {}

/**
 * Tags SQL failures of one backend operation.
 * @param operation - Operation label used in errors and spans.
 * @returns A function wrapping an effect's SqlError into PostgresBackendError.
 * @experimental
 */
export function backendOperation(operation: string) {
  return <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, Exclude<E, SqlError> | PostgresBackendError, R> =>
    effect.pipe(
      Effect.mapError((error) =>
        error instanceof SqlError
          ? new PostgresBackendError({ operation, cause: error, message: `${operation} failed` })
          : (error as Exclude<E, SqlError>),
      ),
      Effect.withSpan(`Postgres.${operation}`),
    );
}

/**
 * Applies the DDL once per namespace while holding a transaction-scoped advisory lock.
 * @param tables - Namespace tables whose lock key serializes creation.
 * @param statements - Idempotent DDL.
 * @returns A lazy effect requiring the SQL client.
 */
const ensureSchema = Effect.fn("Postgres.ensureSchema")(function* (
  tables: PostgresTables,
  statements: readonly string[],
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`select pg_advisory_xact_lock(${tables.lockKey})`;
      for (const statement of statements) yield* sql.unsafe(statement);
    }),
  );
  yield* Effect.logDebug("Postgres backend schema ready").pipe(
    Effect.annotateLogs({ schema: tables.schema }),
  );
});

/**
 * Opens the pool lazily; the first `run` acquires it and creates the schema.
 * @param options - Connection string, namespace and pool size.
 * @returns The connection owner; `close()` must be called to release it.
 * @example const database = openPostgresDatabase({ url: process.env.DATABASE_URL! });
 * @experimental
 */
export function openPostgresDatabase(options: PostgresDatabaseOptions): PostgresDatabase {
  const tables = postgresTables(options);
  if (detectRuntime() === "workers") return openPerOperationDatabase(options, tables);
  const client = PgClient.layer({
    url: Redacted.make(options.url),
    maxConnections: options.maxConnections ?? 10,
    applicationName: "relkit-postgres",
  });
  const layer = Layer.effectDiscard(ensureSchema(tables, postgresBackendSql(options))).pipe(
    Layer.provideMerge(client),
  );
  const runtime = ManagedRuntime.make(layer);
  const fibers = new Set<BackgroundFiber>();
  let closing: Promise<void> | undefined;
  const database: PostgresDatabase = {
    tables,
    run: <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>, signal?: AbortSignal) =>
      runtime.runPromise(effect, signal === undefined ? undefined : { signal }),
    fork: (effect: Effect.Effect<void, never, SqlClient.SqlClient>) => {
      const fiber = runtime.runFork(effect);
      fibers.add(fiber);
      fiber.addObserver(() => fibers.delete(fiber));
      return fiber;
    },
    close: () => {
      closing ??= (async () => {
        await Effect.runPromise(Fiber.interruptAll([...fibers]));
        await runtime.dispose();
      })();
      return closing;
    },
  };
  return Object.freeze(database);
}

/**
 * Connects once per operation, for Cloudflare Workers: a Worker may not use a socket opened while
 * handling another request, so no pool outlives the request, queue batch or Cron Trigger that
 * opened it. Each `run` connects, applies the schema on the isolate's first operation, runs the
 * effect in one connection (transactions included) and disconnects; a `fork` holds its own
 * connection until it ends. Cloudflare Hyperdrive in front of the database keeps this cheap.
 * @param options - Connection string and namespace.
 * @param tables - Namespace tables.
 * @returns The connection owner.
 */
function openPerOperationDatabase(
  options: PostgresDatabaseOptions,
  tables: PostgresTables,
): PostgresDatabase {
  const connection = () =>
    PgClient.layer({
      url: Redacted.make(options.url),
      maxConnections: 1,
      applicationName: "relkit-postgres",
    });
  let schemaReady = false;
  const withSchema = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
    Effect.gen(function* () {
      if (!schemaReady) {
        yield* ensureSchema(tables, postgresBackendSql(options));
        schemaReady = true;
      }
      return yield* effect;
    }).pipe(Effect.provide(connection()));
  const fibers = new Set<BackgroundFiber>();
  return Object.freeze({
    tables,
    run: <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>, signal?: AbortSignal) =>
      Effect.runPromise(withSchema(effect), signal === undefined ? undefined : { signal }),
    fork: (effect: Effect.Effect<void, never, SqlClient.SqlClient>) => {
      const fiber = Effect.runFork(withSchema(effect));
      fibers.add(fiber);
      fiber.addObserver(() => fibers.delete(fiber));
      return fiber;
    },
    close: () => Effect.runPromise(Fiber.interruptAll([...fibers])).then(() => undefined),
  });
}
