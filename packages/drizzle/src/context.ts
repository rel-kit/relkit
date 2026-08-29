import { sql } from "drizzle-orm";
import { createBoundModel } from "./model.js";
import type { DrizzleServiceRuntime, ModelBinding } from "./runtime-types.js";
import type { DatabaseContext, DrizzleServiceDescriptor } from "./types.js";

export function createDatabaseContext<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  runtime: DrizzleServiceRuntime,
  database: unknown,
): DatabaseContext<Service> {
  return contextFor(service, runtime, database, false);
}

function contextFor<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  runtime: DrizzleServiceRuntime,
  database: unknown,
  inTransaction: boolean,
): DatabaseContext<Service> {
  const models: Record<string, object> = {};
  for (const tableName of Object.keys(runtime.tables)) {
    const binding: ModelBinding = Object.freeze({
      drizzle: database,
      table: runtime.tables[tableName]!,
      dialect: runtime.dialect,
      inTransaction,
      metadata: runtime.metadata[tableName]!,
      override: runtime.overrides[tableName] ?? {},
    });
    models[tableName] = createBoundModel(binding, runtime.models[tableName]);
  }
  return Object.freeze({
    ...models,
    zodSchemas: runtime.zodSchemas,
    transaction: async <Value>(
      run: (context: DatabaseContext<Service>) => Value | Promise<Value>,
    ): Promise<Value> => {
      if (inTransaction) throw new TypeError("Nested portable transactions are not supported");
      if (runtime.dialect === "sqlite") {
        return sqliteTransaction(database, () =>
          Promise.resolve(run(contextFor(service, runtime, database, true))),
        );
      }
      return callTransaction(database, (transaction) =>
        Promise.resolve(run(contextFor(service, runtime, transaction, true))),
      );
    },
  }) as DatabaseContext<Service>;
}

const sqliteTails = new WeakMap<object, Promise<void>>();

async function sqliteTransaction<Value>(
  database: unknown,
  run: () => Promise<Value>,
): Promise<Value> {
  const key = database as object;
  const previous = sqliteTails.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  sqliteTails.set(key, tail);
  await previous;
  await runSql(database, "begin");
  try {
    const value = await run();
    await runSql(database, "commit");
    return value;
  } catch (error) {
    await runSql(database, "rollback");
    throw error;
  } finally {
    release();
    if (sqliteTails.get(key) === tail) sqliteTails.delete(key);
  }
}

async function runSql(database: unknown, statement: string): Promise<void> {
  const method = (database as { readonly run?: unknown }).run;
  if (typeof method !== "function") throw new TypeError("SQLite transactions are unavailable");
  await method.call(database, sql.raw(statement));
}

function callTransaction<Value>(
  database: unknown,
  run: (transaction: unknown) => Promise<Value>,
): Promise<Value> {
  const method = (database as { readonly transaction?: unknown }).transaction;
  if (typeof method !== "function") throw new TypeError("Drizzle transactions are unavailable");
  return method.call(database, run) as Promise<Value>;
}
