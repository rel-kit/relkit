import { Effect } from "effect";
import { owners } from "./owner.js";
import { withSqlitePermit } from "./transaction.js";
import { DrizzleFailure } from "./failure.js";

/**
 * Coordinates raw specialized SDK work with portable SQLite operations.
 * @typeParam A - Result.
 * @typeParam E - Typed failure.
 * @typeParam R - Caller services.
 * @param activation - Exact borrowed database owner.
 * @param effect - Native work using nativeCall to retain active parent leases.
 * @returns Interruptible permit waiting followed by physical-client exclusion.
 * @remarks Native callbacks may reenter portable APIs while the parent lease is
 * active. Escaped callbacks must reacquire after that lease expires.
 */
export function withDrizzleSqliteWork<A, E, R>(activation: object, effect: Effect.Effect<A, E, R>) {
  return Effect.suspend(() => {
    const owner = owners.get(activation);
    if (owner === undefined)
      return Effect.fail(
        new DrizzleFailure({
          operation: "coordination",
          cause: new TypeError("Invalid Drizzle activation"),
        }),
      );
    return owner.dialect === "sqlite" ? withSqlitePermit(owner.service.client, effect) : effect;
  });
}
