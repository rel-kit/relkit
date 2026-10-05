import { Effect } from "effect";
import { createBoundModel } from "./model.js";
import type { DrizzleServiceRuntime, ModelBinding } from "./runtime-types.js";
import type { DatabaseContext, DrizzleServiceDescriptor } from "./types.js";
import { nativeCall } from "./failure.js";
import { transactionEffect, withTransactionWork } from "./transaction.js";
import type { NativeLease } from "./native-leases.types.js";
import { observeSpecializedOperation } from "./operation-tracing.js";

import type { ContextRunner } from "./context.types.js";

/**
 * Constructs models without acquiring another client.
 * @typeParam Service - Public descriptor inference.
 * @param service - Database declaration.
 * @param runtime - Pure descriptor metadata.
 * @param database - Owned client.
 * @param run - Runtime execution and owner-admission edge.
 * @returns Frozen public models/schema/transaction context.
 * @see {@link activateDrizzleService} for the checked public owner lifecycle.
 */
export function createDatabaseContext<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  runtime: DrizzleServiceRuntime,
  database: unknown,
  run: ContextRunner,
): DatabaseContext<Service> {
  return contextFor(service, runtime, database, false, run);
}

/**
 * Binds models to one database or active transaction.
 * @typeParam Service - Public descriptor inference.
 * @param service - Database declaration.
 * @param runtime - Metadata and extensions.
 * @param database - Transaction-aware native database.
 * @param inTransaction - Whether nesting is forbidden and parent admission is held.
 * @param execute - Owner execution boundary.
 * @param transactionLease - Active callback lifetime; escaped models cannot reuse it.
 * @returns Frozen context preserving public inference.
 */
function contextFor<Service extends DrizzleServiceDescriptor<any, any, any, any>>(
  service: Service,
  runtime: DrizzleServiceRuntime,
  database: unknown,
  inTransaction: boolean,
  execute: ContextRunner,
  transactionLease?: NativeLease,
): DatabaseContext<Service> {
  const models: Record<string, object> = {};
  for (const tableName of Object.keys(runtime.tables)) {
    const binding: ModelBinding = Object.freeze({
      drizzle: database,
      run: (effect, operation) =>
        execute(
          transactionLease === undefined ? effect : withTransactionWork(transactionLease, effect),
          operation,
        ),
      table: runtime.tables[tableName]!,
      dialect: runtime.dialect,
      inTransaction,
      metadata: runtime.metadata[tableName]!,
      override: runtime.overrides[tableName] ?? {},
      schemas: runtime.effectSchemas[tableName]!,
    });
    models[tableName] = createBoundModel(binding, runtime.models[tableName]);
  }
  return Object.freeze({
    ...models,
    zodSchemas: runtime.zodSchemas,
    transaction: async <Value>(
      run: (context: DatabaseContext<Service>) => Value | Promise<Value>,
    ): Promise<Value> => {
      const operation = inTransaction
        ? nativeCall<Value>("transaction", () => {
            throw new TypeError("Nested portable transactions are not supported");
          })
        : transactionEffect(database, runtime.dialect, (transaction, lease) =>
            Promise.resolve(run(contextFor(service, runtime, transaction, true, execute, lease))),
          );
      return execute(observeSpecializedOperation("database.transaction", operation), "transaction");
    },
  }) as DatabaseContext<Service>;
}
