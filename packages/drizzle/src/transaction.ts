import { sql } from "drizzle-orm";
import { Cause, Effect, Exit, Semaphore } from "effect";
import { DrizzleFailure, nativeCall, squashDrizzleCause } from "./failure.js";
import type { NativeLease } from "./native-leases.types.js";
import {
  closeNativeLease,
  makeNativeLease,
  NativeLeases,
  releaseNativeLease,
  retainNativeLease,
} from "./native-leases.js";

const coordinators = new WeakMap<object, Semaphore.Semaphore>();

/**
 * Executes a portable transaction under the physical SQLite client lock.
 * @typeParam A - Callback result.
 * @param database - Native Drizzle wrapper.
 * @param dialect - Declared database dialect.
 * @param run - Callback using the actual transactional database.
 * @returns Lazy typed transaction work; native calls settle before lock release.
 */
export const transactionEffect = Effect.fn("Drizzle.transaction")(<A>(
  database: unknown,
  dialect: "pg" | "mysql" | "sqlite",
  run: (database: unknown, lease: NativeLease) => Promise<A>,
) => {
  if (dialect !== "sqlite")
    return Effect.flatMap(Effect.context<never>(), (context) =>
      nativeCall("transaction", () => {
        const method = (database as { readonly transaction?: unknown }).transaction;
        if (typeof method !== "function")
          throw new TypeError("Drizzle transactions are unavailable");
        return method.call(database, async (transaction: unknown) => {
          const exit = await Effect.runPromiseExit(
            transactionCallback(transaction, run).pipe(Effect.provideContext(context)),
          );
          if (Exit.isFailure(exit)) throw squashDrizzleCause(exit.cause);
          return exit.value;
        }) as Promise<A>;
      }),
    );
  // Permit waiting is interruptible; once BEGIN starts no callback/driver promise
  // may outlive the protected transaction and race rollback or a new BEGIN.
  return withSqlitePermit(
    database,
    Effect.uninterruptible(
      Effect.gen(function* () {
        yield* runSql(database, "begin");
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            const value = yield* transactionCallback(database, run);
            yield* runSql(database, "commit");
            return value;
          }),
        );
        if (Exit.isSuccess(exit)) return exit.value;
        const rollback = yield* Effect.exit(runSql(database, "rollback"));
        return yield* Effect.failCause(
          Exit.isFailure(rollback) ? Cause.combine(exit.cause, rollback.cause) : exit.cause,
        );
      }),
    ),
  );
});

/**
 * Keeps transaction-bound descendants inside the callback's native lifetime.
 * @typeParam A - Callback result.
 * @param database - Actual transaction client.
 * @param run - Public callback receiving its expiring lease.
 * @returns Callback result after all retained children settle, before commit/rollback.
 */
function transactionCallback<A>(
  database: unknown,
  run: (database: unknown, lease: NativeLease) => Promise<A>,
) {
  return Effect.gen(function* () {
    const lease = yield* makeNativeLease({});
    return yield* nativeCall("transaction", () => run(database, lease)).pipe(
      Effect.ensuring(closeNativeLease(lease)),
    );
  });
}

/**
 * Retains a transaction callback while one child operation executes.
 * @typeParam A - Child result.
 * @typeParam E - Original failure.
 * @typeParam R - Required caller services.
 * @param lease - Callback capability, closed before the native transaction ends.
 * @param effect - Lazy transaction-bound operation.
 * @returns Child work, or a typed failure when its transaction has ended.
 */
export function withTransactionWork<A, E, R>(lease: NativeLease, effect: Effect.Effect<A, E, R>) {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      if (!(yield* retainNativeLease(lease)))
        return yield* Effect.fail(
          new DrizzleFailure({
            operation: "transaction",
            cause: new TypeError("Drizzle transaction is closed"),
          }),
        );
      return yield* restore(effect).pipe(Effect.ensuring(releaseNativeLease(lease)));
    }),
  );
}

/**
 * Serializes conflicting SQLite work at the physical client boundary.
 * @typeParam A - Success value.
 * @typeParam E - Caller failure.
 * @typeParam R - Caller services.
 * @param database - Native wrapper or physical client.
 * @param effect - Lazy work; native calls must settle before its lease ends.
 * @returns Interruptible permit waiting followed by protected work.
 * @remarks Transaction-bound children already hold the parent's permit and must
 * bypass this combinator. Weak keys permit collection when native owners expire.
 */
export function withSqlitePermit<A, E, R>(
  database: unknown,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DrizzleFailure, R> {
  return Effect.flatMap(
    Effect.try({
      try: () => {
        if (database === null || (typeof database !== "object" && typeof database !== "function"))
          throw new TypeError("SQLite transactions are unavailable");
        const physical = (database as { readonly $client?: unknown }).$client;
        const key =
          physical !== null && (typeof physical === "object" || typeof physical === "function")
            ? physical
            : database;
        let semaphore = coordinators.get(key);
        if (semaphore === undefined) {
          semaphore = Semaphore.makeUnsafe(1);
          coordinators.set(key, semaphore);
        }
        return { semaphore, key };
      },
      catch: (cause) => new DrizzleFailure({ operation: "coordination", cause }),
    }),
    ({ semaphore, key }) =>
      Effect.flatMap(NativeLeases, (leases) => {
        const acquire = () =>
          semaphore.withPermit(
            Effect.flatMap(makeNativeLease(key), (lease) => {
              return effect.pipe(
                Effect.provideService(NativeLeases, { ...leases, sqlite: lease }),
                Effect.ensuring(closeNativeLease(lease)),
              );
            }),
          );
        const lease = leases.sqlite;
        if (lease?.key !== key) return acquire();
        return Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            if (!(yield* retainNativeLease(lease))) return yield* restore(acquire());
            return yield* restore(effect).pipe(Effect.ensuring(releaseNativeLease(lease)));
          }),
        );
      }),
  );
}

/**
 * Runs native SQLite transaction control without assuming cancellation.
 * @param database - Drizzle wrapper exposing run.
 * @param statement - Fixed transaction control statement.
 * @returns Completion or original typed native failure.
 */
function runSql(database: unknown, statement: "begin" | "commit" | "rollback") {
  return nativeCall(statement, () => {
    const method = (database as { readonly run?: unknown }).run;
    if (typeof method !== "function") throw new TypeError("SQLite transactions are unavailable");
    return method.call(database, sql.raw(statement));
  });
}
