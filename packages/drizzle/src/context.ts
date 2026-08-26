import { bindModel } from "./model.js";
import { runtimeOf } from "./metadata.js";
import { sql } from "drizzle-orm";
import type { DataModelRuntime, ModelBinding } from "./runtime-types.js";
import type { DatabaseContext, DataModelDescriptor } from "./types.js";

export function createDatabaseContext<Descriptor extends DataModelDescriptor<any, any, any>>(
  dataModel: Descriptor,
): DatabaseContext<Descriptor> {
  return contextFor(dataModel, runtimeOf(dataModel), runtimeOf(dataModel).drizzle, false);
}

function contextFor<Descriptor extends DataModelDescriptor<any, any, any>>(
  descriptor: Descriptor,
  runtime: DataModelRuntime,
  drizzle: unknown,
  inTransaction: boolean,
): DatabaseContext<Descriptor> {
  const models: Record<string, object> = {};
  for (const tableName of Object.keys(runtime.tables)) {
    const Model = runtime.models[tableName]!;
    const binding: ModelBinding = Object.freeze({
      drizzle,
      table: runtime.tables[tableName]!,
      dialect: descriptor.dialect,
      inTransaction,
      metadata: runtime.metadata[tableName]!,
      override: runtime.overrides[tableName] ?? {},
    });
    models[tableName] = bindModel(new Model(), binding);
  }
  return Object.freeze({
    ...models,
    zodSchemas: runtime.zodSchemas,
    transaction: async <Value>(
      run: (context: DatabaseContext<Descriptor>) => Value,
    ): Promise<Value> => {
      if (inTransaction) throw new TypeError("Nested portable transactions are not supported");
      if (descriptor.dialect === "sqlite") {
        return sqliteTransaction(drizzle, () =>
          Promise.resolve(run(contextFor(descriptor, runtime, drizzle, true))),
        );
      }
      return callTransaction(drizzle, (transaction) =>
        Promise.resolve(run(contextFor(descriptor, runtime, transaction, true))),
      );
    },
  }) as DatabaseContext<Descriptor>;
}

const sqliteTails = new WeakMap<object, Promise<void>>();

async function sqliteTransaction<Value>(
  drizzle: unknown,
  run: () => Promise<Value>,
): Promise<Value> {
  const key = drizzle as object;
  const previous = sqliteTails.get(key) ?? Promise.resolve();
  let release = (): void => undefined;
  // ponytail: one queue per SQLite client; use a pool-aware lock if parallel writers are added.
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  sqliteTails.set(key, tail);
  await previous;
  await runSql(drizzle, "begin");
  try {
    const value = await run();
    await runSql(drizzle, "commit");
    return value;
  } catch (error) {
    await runSql(drizzle, "rollback");
    throw error;
  } finally {
    release();
    if (sqliteTails.get(key) === tail) sqliteTails.delete(key);
  }
}

async function runSql(drizzle: unknown, statement: string): Promise<void> {
  const method = (drizzle as { readonly run?: unknown }).run;
  if (typeof method !== "function") throw new TypeError("SQLite transactions are unavailable");
  await method.call(drizzle, sql.raw(statement));
}

function callTransaction<Value>(
  drizzle: unknown,
  run: (transaction: unknown) => Promise<Value>,
): Promise<Value> {
  const method = (drizzle as { readonly transaction?: unknown }).transaction;
  if (typeof method !== "function") throw new TypeError("Drizzle transactions are unavailable");
  return method.call(drizzle, run) as Promise<Value>;
}
