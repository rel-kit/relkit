import { Effect } from "effect";
import type { ModelBinding } from "./runtime-types.js";
import { nativeCall, type DrizzleFailure } from "./failure.js";
import { observeSpecializedOperation } from "./operation-tracing.js";
import { transactionEffect, withSqlitePermit, withTransactionWork } from "./transaction.js";
import { redactSpecializedTrace } from "./trace-redaction.js";
import { checked, findOne, findMany } from "./queries.js";
import { insert, update, remove } from "./mutations.js";
import { isRecord, requiredRow, selector } from "./operations.utils.js";

/**
 * Runs one lazy CRUD workflow at its compatibility edge.
 * @param binding - Owned client/model/transaction binding.
 * @param name - Reserved CRUD operation.
 * @param args - Public arguments validated inside the workflow.
 * @returns Native Promise result retaining expected native rejection identity.
 */
export function runOperation(binding: ModelBinding, name: string, args: unknown): Promise<unknown> {
  return binding.run(operationEffect(binding, name, args), name);
}

/**
 * Composes overrides and MySQL write/recovery transaction ownership.
 * @param binding - Model binding.
 * @param name - Reserved operation.
 * @param args - Original override arguments.
 * @returns Lazy CRUD work with typed failures and no automatic write retries.
 * @example Compose a page with an existing owner and table binding
 * ```ts
 * import { Effect } from "effect";
 * import type { ManagedRuntime } from "effect";
 * import { DrizzleFailure, DrizzleOwner, operationEffect, runDrizzlePromise } from "@relkit/drizzle/internal";
 * function page(owner: ManagedRuntime.ManagedRuntime<DrizzleOwner, DrizzleFailure>, binding: Parameters<typeof operationEffect>[0]) {
 *   return runDrizzlePromise(owner, Effect.gen(function* () {
 *     const service = yield* DrizzleOwner;
 *     return yield* service.work(operationEffect(binding, "findMany", { limit: 10 }));
 *   }));
 * }
 * ```
 */
export function operationEffect(
  binding: ModelBinding,
  name: string,
  args: unknown,
): Effect.Effect<unknown, DrizzleFailure> {
  return redactSpecializedTrace(
    observeSpecializedOperation(`database.${name}`, operationWorkflow(binding, name, args)),
  );
}

/**
 * Composes the unobserved core for nested dialect recovery and override bases.
 * @param binding - Transaction-aware native dependencies.
 * @param name - Reserved CRUD operation.
 * @param args - Original public arguments.
 * @returns Lazy work counted by the independently callable outer operation.
 */
const operationWorkflow = Effect.fn("Drizzle.operation")((
  binding: ModelBinding,
  name: string,
  args: unknown,
): Effect.Effect<unknown, DrizzleFailure> => {
  if (
    binding.dialect === "mysql" &&
    !binding.inTransaction &&
    ["insert", "update", "upsert", "delete"].includes(name)
  ) {
    return transactionEffect(binding.drizzle, "mysql", (drizzle, lease) => {
      const transactionBinding: ModelBinding = {
        ...binding,
        drizzle,
        inTransaction: true,
        run: (effect, operation) => binding.run(withTransactionWork(lease, effect), operation),
      };
      return transactionBinding.run(operationWorkflow(transactionBinding, name, args), name);
    });
  }
  const override = binding.override[name];
  const base = (next: unknown) => {
    const core = baseOperation(binding, name, next);
    return binding.run(
      binding.dialect === "sqlite" && !binding.inTransaction
        ? withSqlitePermit(binding.drizzle, core)
        : core,
      name,
    );
  };
  const effect =
    typeof override === "function"
      ? nativeCall(name, () => override({ args, base }))
      : baseOperation(binding, name, args);
  return binding.dialect === "sqlite" && !binding.inTransaction
    ? withSqlitePermit(binding.drizzle, effect)
    : effect;
});

/**
 * Dispatches validated arguments to named domain workflows.
 * @param binding - Table/client metadata.
 * @param name - Reserved operation.
 * @param args - Unknown public arguments.
 * @returns Lazy operation result or typed validation failure.
 */
function baseOperation(
  binding: ModelBinding,
  name: string,
  args: unknown,
): Effect.Effect<unknown, DrizzleFailure> {
  return Effect.gen(function* () {
    const value = isRecord(args) ? args : {};
    const where = () => selector(binding, value.where);
    switch (name) {
      case "findOne":
        return yield* findOne(binding, yield* checked(where));
      case "findMany":
        return yield* findMany(binding, value);
      case "insert":
        return yield* insert(binding, value.data);
      case "update":
        return yield* update(binding, yield* checked(where), value.data);
      case "delete":
        return yield* remove(binding, yield* checked(where));
      case "upsert": {
        const selected = yield* checked(where);
        const existing = yield* findOne(binding, selected);
        return existing === null
          ? yield* insert(binding, value.create)
          : yield* update(binding, selected, value.update).pipe(
              Effect.flatMap((row) => checked(() => requiredRow(row))),
            );
      }
      default:
        return yield* checked(() => {
          throw new TypeError(`Unknown model operation "${name}"`);
        });
    }
  });
}
